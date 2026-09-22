import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';

interface RetentionPolicy {
  retentionDays: number;
  cutoff: Date;
}

export interface DataRetentionResult {
  completedAt: Date;
  policies: {
    auditLogs: RetentionPolicy;
    notifications: RetentionPolicy;
    healthMetrics: RetentionPolicy;
    expiredSecurityTokens: RetentionPolicy;
  };
  deleted: {
    auditLogs: number;
    notifications: number;
    healthMetrics: number;
    authSessions: number;
    oneTimeTokens: number;
    twoFactorChallenges: number;
  };
}

@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 15 3 * * *', {
    name: 'database-data-retention',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  async scheduledRun(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const result = await this.enforceRetention();
      const deleted = Object.values(result.deleted).reduce(
        (total, count) => total + count,
        0,
      );
      if (deleted > 0) {
        this.logger.log(`Data retention removed ${deleted} expired record(s)`);
      }
    } catch (error) {
      const code =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.error(`Data retention run failed (${code})`);
    } finally {
      this.running = false;
    }
  }

  getPolicies(now = new Date()) {
    const auditDays = this.numberConfig(
      'AUDIT_LOG_RETENTION_DAYS',
      365,
      30,
      3650,
    );
    const notificationDays = this.numberConfig(
      'NOTIFICATION_RETENTION_DAYS',
      180,
      30,
      3650,
    );
    const healthMetricDays = this.numberConfig(
      'HEALTH_METRIC_RETENTION_DAYS',
      2555,
      365,
      36500,
    );
    const expiredTokenDays = this.numberConfig(
      'EXPIRED_SECURITY_TOKEN_RETENTION_DAYS',
      7,
      1,
      90,
    );

    return {
      auditLogs: this.policy(now, auditDays),
      notifications: this.policy(now, notificationDays),
      healthMetrics: this.policy(now, healthMetricDays),
      expiredSecurityTokens: this.policy(now, expiredTokenDays),
    };
  }

  async enforceRetention(now = new Date()): Promise<DataRetentionResult> {
    const policies = this.getPolicies(now);
    const batchSize = this.numberConfig(
      'DATA_RETENTION_BATCH_SIZE',
      1_000,
      100,
      10_000,
    );
    const maxBatches = this.numberConfig(
      'DATA_RETENTION_MAX_BATCHES',
      20,
      1,
      100,
    );

    // Notifications are removed before audit records so this run's summary is
    // retained. Notification deliveries cascade with their parent record.
    const notifications = await this.deleteInBatches(
      (take) =>
        this.prisma.notification.findMany({
          where: { createdAt: { lt: policies.notifications.cutoff } },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take,
        }),
      (ids) =>
        this.prisma.notification.deleteMany({ where: { id: { in: ids } } }),
      batchSize,
      maxBatches,
    );
    const healthMetrics = await this.deleteInBatches(
      (take) =>
        this.prisma.healthMetric.findMany({
          where: { measuredAt: { lt: policies.healthMetrics.cutoff } },
          select: { id: true },
          orderBy: { measuredAt: 'asc' },
          take,
        }),
      (ids) =>
        this.prisma.healthMetric.deleteMany({ where: { id: { in: ids } } }),
      batchSize,
      maxBatches,
    );
    const authSessions = await this.deleteInBatches(
      (take) =>
        this.prisma.authSession.findMany({
          where: {
            OR: [
              { expiresAt: { lt: policies.expiredSecurityTokens.cutoff } },
              { revokedAt: { lt: policies.expiredSecurityTokens.cutoff } },
            ],
          },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take,
        }),
      (ids) =>
        this.prisma.authSession.deleteMany({ where: { id: { in: ids } } }),
      batchSize,
      maxBatches,
    );
    const oneTimeTokens = await this.deleteInBatches(
      (take) =>
        this.prisma.oneTimeToken.findMany({
          where: {
            OR: [
              { expiresAt: { lt: policies.expiredSecurityTokens.cutoff } },
              { consumedAt: { lt: policies.expiredSecurityTokens.cutoff } },
            ],
          },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take,
        }),
      (ids) =>
        this.prisma.oneTimeToken.deleteMany({ where: { id: { in: ids } } }),
      batchSize,
      maxBatches,
    );
    const twoFactorChallenges = await this.deleteInBatches(
      (take) =>
        this.prisma.twoFactorChallenge.findMany({
          where: {
            OR: [
              { expiresAt: { lt: policies.expiredSecurityTokens.cutoff } },
              { consumedAt: { lt: policies.expiredSecurityTokens.cutoff } },
            ],
          },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take,
        }),
      (ids) =>
        this.prisma.twoFactorChallenge.deleteMany({
          where: { id: { in: ids } },
        }),
      batchSize,
      maxBatches,
    );
    const auditLogs = await this.deleteInBatches(
      (take) =>
        this.prisma.auditLog.findMany({
          where: { createdAt: { lt: policies.auditLogs.cutoff } },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take,
        }),
      (ids) => this.prisma.auditLog.deleteMany({ where: { id: { in: ids } } }),
      batchSize,
      maxBatches,
    );

    const deleted = {
      auditLogs,
      notifications,
      healthMetrics,
      authSessions,
      oneTimeTokens,
      twoFactorChallenges,
    };
    const result = { completedAt: now, policies, deleted };

    if (Object.values(deleted).some((count) => count > 0)) {
      await this.prisma.auditLog.create({
        data: {
          action: 'DATA_RETENTION_COMPLETED',
          entity: 'System',
          metadata: {
            deleted,
            cutoffs: Object.fromEntries(
              Object.entries(policies).map(([name, policy]) => [
                name,
                policy.cutoff.toISOString(),
              ]),
            ),
          },
        },
      });
    }

    return result;
  }

  private async deleteInBatches(
    findIds: (take: number) => Promise<Array<{ id: string }>>,
    deleteIds: (ids: string[]) => Promise<{ count: number }>,
    batchSize: number,
    maxBatches: number,
  ): Promise<number> {
    let total = 0;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const records = await findIds(batchSize);
      if (records.length === 0) break;

      const result = await deleteIds(records.map(({ id }) => id));
      total += result.count;
      if (records.length < batchSize) break;
    }
    return total;
  }

  private policy(now: Date, retentionDays: number): RetentionPolicy {
    return {
      retentionDays,
      cutoff: new Date(now.getTime() - retentionDays * 24 * 60 * 60_000),
    };
  }

  private numberConfig(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(maximum, Math.max(minimum, Math.floor(value)))
      : fallback;
  }
}
