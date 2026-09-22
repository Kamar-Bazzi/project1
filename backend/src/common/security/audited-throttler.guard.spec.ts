import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import type { ThrottlerLimitDetail, ThrottlerStorage } from '@nestjs/throttler';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditedThrottlerGuard } from './audited-throttler.guard';

class ExposedAuditedThrottlerGuard extends AuditedThrottlerGuard {
  throwForTest(context: ExecutionContext, detail: ThrottlerLimitDetail) {
    return this.throwThrottlingException(context, detail);
  }
}

describe('AuditedThrottlerGuard', () => {
  it('records and coalesces rate-limit events without changing the 429', async () => {
    interface AuditArguments {
      data: {
        action: string;
        ipAddress?: string;
        metadata?: Record<string, unknown>;
      };
    }
    const create = jest
      .fn<Promise<{ id: string }>, [AuditArguments]>()
      .mockResolvedValue({ id: 'audit-id' });
    const guard = new ExposedAuditedThrottlerGuard(
      [{ name: 'default', ttl: 60_000, limit: 5 }],
      {} as ThrottlerStorage,
      new Reflector(),
      { auditLog: { create } } as unknown as PrismaService,
    );
    const request = {
      ip: '203.0.113.8',
      method: 'POST',
      path: '/api/v1/auth/login',
      originalUrl: '/api/v1/auth/login?secret=must-not-be-stored',
      headers: { 'user-agent': 'Example Browser' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const detail: ThrottlerLimitDetail = {
      key: 'login:203.0.113.8',
      tracker: '203.0.113.8',
      limit: 5,
      ttl: 60_000,
      totalHits: 6,
      timeToExpire: 42,
      isBlocked: true,
      timeToBlockExpire: 42,
    };

    await expect(guard.throwForTest(context, detail)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    await expect(guard.throwForTest(context, detail)).rejects.toBeInstanceOf(
      ThrottlerException,
    );

    expect(create).toHaveBeenCalledTimes(1);
    const audit = create.mock.calls[0][0];
    expect(audit.data).toMatchObject({
      action: 'RATE_LIMIT_EXCEEDED',
      ipAddress: '203.0.113.8',
    });
    expect(audit.data.metadata).toMatchObject({
      method: 'POST',
      path: '/api/v1/auth/login',
      limit: 5,
    });
  });
});
