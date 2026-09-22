import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { DataRetentionService } from './data-retention.service';

describe('DataRetentionService', () => {
  function collection(id: string, count = 1) {
    return {
      findMany: jest.fn().mockResolvedValue([{ id }]),
      deleteMany: jest.fn().mockResolvedValue({ count }),
    };
  }

  it('deletes each data class using its own bounded retention cutoff', async () => {
    interface RetentionAuditArguments {
      data: {
        action: string;
        entity: string;
        metadata?: Record<string, unknown>;
      };
    }
    const auditLog = {
      ...collection('audit-id', 2),
      create: jest
        .fn<Promise<{ id: string }>, [RetentionAuditArguments]>()
        .mockResolvedValue({ id: 'retention-audit-id' }),
    };
    const notification = collection('notification-id', 3);
    const healthMetric = collection('metric-id', 4);
    const authSession = collection('session-id', 5);
    const oneTimeToken = collection('token-id', 6);
    const twoFactorChallenge = collection('challenge-id', 7);
    const prisma = {
      auditLog,
      notification,
      healthMetric,
      authSession,
      oneTimeToken,
      twoFactorChallenge,
    } as unknown as PrismaService;
    const configured: Record<string, string> = {
      AUDIT_LOG_RETENTION_DAYS: '90',
      NOTIFICATION_RETENTION_DAYS: '45',
      HEALTH_METRIC_RETENTION_DAYS: '730',
      EXPIRED_SECURITY_TOKEN_RETENTION_DAYS: '3',
    };
    const config = {
      get: jest.fn((key: string) => configured[key]),
    } as unknown as ConfigService;
    const service = new DataRetentionService(prisma, config);
    const now = new Date('2026-09-07T12:00:00.000Z');

    const result = await service.enforceRetention(now);

    // Audit retention has a safety floor of 30 days but accepts this 90-day
    // policy; health history uses the independently configured 730-day rule.
    expect(result.policies.auditLogs.retentionDays).toBe(90);
    expect(result.policies.notifications.retentionDays).toBe(45);
    expect(result.policies.healthMetrics.retentionDays).toBe(730);
    expect(result.policies.expiredSecurityTokens.retentionDays).toBe(3);
    expect(result.deleted).toEqual({
      auditLogs: 2,
      notifications: 3,
      healthMetrics: 4,
      authSessions: 5,
      oneTimeTokens: 6,
      twoFactorChallenges: 7,
    });
    expect(healthMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          measuredAt: { lt: result.policies.healthMetrics.cutoff },
        },
      }),
    );
    expect(oneTimeToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              expiresAt: {
                lt: result.policies.expiredSecurityTokens.cutoff,
              },
            },
            {
              consumedAt: {
                lt: result.policies.expiredSecurityTokens.cutoff,
              },
            },
          ],
        },
      }),
    );
    const retentionAudit = auditLog.create.mock.calls[0][0];
    expect(retentionAudit.data).toMatchObject({
      action: 'DATA_RETENTION_COMPLETED',
      entity: 'System',
    });
  });

  it('does not create a noisy audit event when nothing expired', async () => {
    const emptyCollection = () => ({
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
    });
    const auditLog = {
      ...emptyCollection(),
      create: jest.fn(),
    };
    const prisma = {
      auditLog,
      notification: emptyCollection(),
      healthMetric: emptyCollection(),
      authSession: emptyCollection(),
      oneTimeToken: emptyCollection(),
      twoFactorChallenge: emptyCollection(),
    } as unknown as PrismaService;
    const config = { get: jest.fn() } as unknown as ConfigService;

    const result = await new DataRetentionService(
      prisma,
      config,
    ).enforceRetention();

    expect(Object.values(result.deleted)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(auditLog.create).not.toHaveBeenCalled();
  });
});
