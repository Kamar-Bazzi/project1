import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, UserRole } from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService advanced sessions', () => {
  interface UpdateManySessionArguments {
    where: {
      id: string;
      revokedAt: null;
      tokenHash?: string;
      expiresAt?: { gt: Date };
    };
    data: {
      revokedAt?: Date;
      tokenHash?: string;
      expiresAt?: Date;
      lastUsedAt?: Date;
    };
  }

  const sessionId = '10000000-0000-4000-8000-000000000001';
  const secret = 'abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-';
  const tokenHash = createHash('sha256').update(secret).digest('hex');
  const user = {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Test Patient',
    email: 'patient@example.test',
    passwordHash: 'unused',
    role: UserRole.PATIENT,
    accountStatus: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    passwordChangedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const findUniqueSession = jest.fn();
  const updateManySessions = jest.fn<
    Promise<{ count: number }>,
    [UpdateManySessionArguments]
  >();
  const signAsync = jest.fn<Promise<string>, [Record<string, unknown>]>();
  const transactionClient = {
    authSession: {
      findUnique: findUniqueSession,
      updateMany: updateManySessions,
    },
  };
  const prisma = {
    $transaction: jest.fn(
      (operation: (transaction: typeof transactionClient) => unknown) =>
        operation(transactionClient),
    ),
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    { signAsync } as unknown as JwtService,
    { get: jest.fn() } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findUniqueSession.mockResolvedValue({
      id: sessionId,
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    });
    updateManySessions.mockResolvedValue({ count: 1 });
    signAsync.mockResolvedValue('new-access-token');
  });

  it('rotates a valid refresh token and never returns it as the access token', async () => {
    const result = await service.refresh(`${sessionId}.${secret}`);

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toMatch(new RegExp(`^${sessionId}\\.`));
    expect(result.refreshToken).not.toBe(`${sessionId}.${secret}`);
    const updateArguments = updateManySessions.mock.calls[0][0];
    expect(updateArguments.where.id).toBe(sessionId);
    expect(updateArguments.where.tokenHash).toBe(tokenHash);
    expect(updateArguments.where.revokedAt).toBeNull();
    expect(updateArguments.where.expiresAt?.gt).toBeInstanceOf(Date);
    expect(updateArguments.data.tokenHash).not.toBe(tokenHash);
    expect(updateArguments.data.lastUsedAt).toBeInstanceOf(Date);
    const accessPayload = signAsync.mock.calls[0][0];
    expect(accessPayload.sub).toBe(user.id);
    expect(accessPayload.sid).toBe(sessionId);
  });

  it('revokes the session when a rotated token is replayed', async () => {
    findUniqueSession.mockResolvedValue({
      id: sessionId,
      userId: user.id,
      tokenHash: createHash('sha256').update('new-secret').digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    });

    await expect(service.refresh(`${sessionId}.${secret}`)).rejects.toThrow(
      'Refresh token reuse detected',
    );
    const revocation = updateManySessions.mock.calls[0][0];
    expect(revocation.where).toEqual({ id: sessionId, revokedAt: null });
    expect(revocation.data.revokedAt).toBeInstanceOf(Date);
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('rejects refresh for a suspended account', async () => {
    findUniqueSession.mockResolvedValue({
      id: sessionId,
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: { ...user, accountStatus: AccountStatus.SUSPENDED },
    });

    await expect(service.refresh(`${sessionId}.${secret}`)).rejects.toThrow(
      'Account is not active',
    );
    expect(signAsync).not.toHaveBeenCalled();
  });
});
