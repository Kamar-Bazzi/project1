import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

import { PrismaService } from '../../prisma/prisma.service';

interface RateLimitedRequest {
  ip?: string;
  method?: string;
  path?: string;
  originalUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
  user?: { id?: string };
}

/**
 * Records bounded, privacy-conscious rate-limit events for administrators.
 * A short in-process coalescing window prevents a blocked client from turning
 * the audit table into another denial-of-service target.
 */
@Injectable()
export class AuditedThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AuditedThrottlerGuard.name);
  private readonly lastRecordedByKey = new Map<string, number>();

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    super(options, storageService, reflector);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    if (this.shouldRecord(detail.key)) {
      const request = context.switchToHttp().getRequest<RateLimitedRequest>();
      const userId =
        typeof request.user?.id === 'string' ? request.user.id : undefined;
      const userAgent = this.headerValue(request.headers?.['user-agent']);
      const path = (request.path ?? request.originalUrl ?? 'unknown').split(
        '?',
        1,
      )[0];

      try {
        await this.prisma.auditLog.create({
          data: {
            userId,
            action: 'RATE_LIMIT_EXCEEDED',
            entity: 'HttpRequest',
            entityId: userId,
            ipAddress: request.ip?.slice(0, 128),
            userAgent: userAgent?.slice(0, 512),
            metadata: {
              method: (request.method ?? 'UNKNOWN').slice(0, 16),
              path: path.slice(0, 512),
              limit: detail.limit,
              ttlMilliseconds: detail.ttl,
              retryAfterSeconds: detail.timeToBlockExpire,
              totalHits: detail.totalHits,
              coalescedWindowSeconds: this.coalescingSeconds(),
            },
          },
        });
      } catch (error) {
        const code =
          error instanceof Error ? error.constructor.name : 'UnknownError';
        this.logger.warn(`Could not record rate-limit audit event (${code})`);
      }
    }

    await super.throwThrottlingException(context, detail);
  }

  private shouldRecord(key: string): boolean {
    const now = Date.now();
    const prior = this.lastRecordedByKey.get(key);
    const coalescingMilliseconds = this.coalescingSeconds() * 1_000;

    if (prior !== undefined && now - prior < coalescingMilliseconds) {
      return false;
    }

    this.lastRecordedByKey.set(key, now);
    if (this.lastRecordedByKey.size > 5_000) {
      const staleBefore = now - coalescingMilliseconds;
      for (const [candidate, recordedAt] of this.lastRecordedByKey) {
        if (recordedAt < staleBefore) this.lastRecordedByKey.delete(candidate);
      }
    }
    return true;
  }

  private coalescingSeconds(): number {
    const configured = Number(process.env.RATE_LIMIT_AUDIT_COALESCE_SECONDS);
    return Number.isFinite(configured)
      ? Math.min(300, Math.max(5, Math.floor(configured)))
      : 30;
  }

  private headerValue(
    value: string | string[] | undefined,
  ): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }
}
