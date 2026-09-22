import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService abnormal login protection', () => {
  interface UserUpdateArguments {
    where: { id: string; OR?: unknown[] };
    data: {
      failedLoginAttempts: number;
      lastFailedLoginAt: Date | null;
      lockedUntil: Date | null;
    };
  }

  interface AuditCreateArguments {
    data: {
      userId?: string;
      action: string;
      metadata?: Record<string, unknown>;
    };
    select?: { id: boolean };
  }

  interface SessionCreateArguments {
    data: {
      deviceFingerprint?: string;
      networkFingerprint?: string;
    };
  }

  const user = {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Patient',
    email: 'patient@example.test',
    passwordHash: 'stored-password-hash',
    role: UserRole.PATIENT,
    accountStatus: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    passwordChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    twoFactorMethod: null,
    twoFactorSecretEncrypted: null,
    twoFactorEnabledAt: null,
    failedLoginAttempts: 0,
    lastFailedLoginAt: null,
    lockedUntil: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const findUniqueUser = jest.fn();
  const updateManyUsers = jest.fn<
    Promise<{ count: number }>,
    [UserUpdateArguments]
  >();
  const countAudits = jest.fn();
  const createAudit = jest.fn<
    Promise<{ id: string }>,
    [AuditCreateArguments]
  >();
  const findFirstSession = jest.fn();
  const findManySessions = jest.fn();
  const createSession = jest.fn<
    Promise<{ id: string }>,
    [SessionCreateArguments]
  >();
  const signAsync = jest.fn();
  const configGet = jest.fn();
  const prisma = {
    user: {
      findUnique: findUniqueUser,
      updateMany: updateManyUsers,
    },
    auditLog: {
      count: countAudits,
      create: createAudit,
    },
    authSession: {
      findFirst: findFirstSession,
      findMany: findManySessions,
      create: createSession,
    },
  } as unknown as PrismaService;
  const service = new AuthService(
    prisma,
    { signAsync } as unknown as JwtService,
    { get: configGet } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findUniqueUser.mockResolvedValue(user);
    updateManyUsers.mockResolvedValue({ count: 1 });
    countAudits.mockResolvedValue(0);
    createAudit.mockResolvedValue({ id: 'audit-id' });
    findManySessions.mockResolvedValue([]);
    createSession.mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001',
    });
    signAsync.mockResolvedValue('access-token');
    configGet.mockReturnValue(undefined);
  });

  it('creates a short lock only after the conservative failure threshold', async () => {
    jest.mocked(bcrypt.compare).mockResolvedValue(false);
    findUniqueUser.mockResolvedValue({
      ...user,
      failedLoginAttempts: 9,
      lastFailedLoginAt: new Date(),
    });
    countAudits.mockResolvedValue(9);

    await expect(
      service.login(
        { email: user.email, password: 'incorrect-password' },
        { ipAddress: '203.0.113.8', userAgent: 'Example Browser' },
      ),
    ).rejects.toThrow('Invalid email or password');

    const update = updateManyUsers.mock.calls[0][0];
    expect(update.where).toEqual({ id: user.id });
    expect(update.data.failedLoginAttempts).toBe(10);
    expect(update.data.lockedUntil).toBeInstanceOf(Date);
    const lockedAudit = createAudit.mock.calls
      .map(([arguments_]) => arguments_)
      .find(({ data }) => data.action === 'ACCOUNT_TEMPORARILY_LOCKED');
    expect(lockedAudit?.data).toMatchObject({
      action: 'ACCOUNT_TEMPORARILY_LOCKED',
      userId: user.id,
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('audits a new-device plus new-network login without blocking it', async () => {
    jest.mocked(bcrypt.compare).mockResolvedValue(true);
    findFirstSession
      .mockResolvedValueOnce({ id: 'prior-session' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await service.login(
      { email: user.email, password: 'correct-password' },
      { ipAddress: '203.0.113.8', userAgent: 'New Example Browser' },
    );

    expect(result.accessToken).toBe('access-token');
    const session = createSession.mock.calls[0][0];
    expect(session.data.deviceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(session.data.networkFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const unusualAudit = createAudit.mock.calls
      .map(([arguments_]) => arguments_)
      .find(({ data }) => data.action === 'UNUSUAL_LOGIN_ATTEMPT');
    expect(unusualAudit?.data.metadata).toMatchObject({
      outcome: 'SUCCESS',
      reason: 'NEW_DEVICE_AND_NETWORK',
      signals: ['NEW_DEVICE', 'NEW_NETWORK'],
    });
  });

  it('does not flag a browser change on a recognized network as unusual', async () => {
    jest.mocked(bcrypt.compare).mockResolvedValue(true);
    findFirstSession
      .mockResolvedValueOnce({ id: 'prior-session' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'same-network-session' });

    await service.login(
      { email: user.email, password: 'correct-password' },
      { ipAddress: '203.0.113.8', userAgent: 'Updated Example Browser' },
    );

    expect(
      createAudit.mock.calls.some(
        ([arguments_]) => arguments_.data.action === 'UNUSUAL_LOGIN_ATTEMPT',
      ),
    ).toBe(false);
    expect(createSession).toHaveBeenCalled();
  });
});
