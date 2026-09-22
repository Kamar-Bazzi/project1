import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WearableSyncMonitorService {
  private readonly logger = new Logger(WearableSyncMonitorService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES, {
    name: 'wearable-sync-monitor',
    waitForCompletion: true,
  })
  async scheduledRun(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const warned = await this.processStaleDevices();
      if (warned > 0) {
        this.logger.log(`Created ${warned} stale wearable warning(s)`);
      }
    } catch (error) {
      const code =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.error(`Wearable synchronization monitor failed (${code})`);
    } finally {
      this.running = false;
    }
  }

  async processStaleDevices(now = new Date()): Promise<number> {
    const devices = await this.prisma.wearableDevice.findMany({
      where: { active: true, staleNotificationSentAt: null },
      select: {
        id: true,
        deviceName: true,
        provider: true,
        connectedAt: true,
        lastSyncAt: true,
        syncWarningAfterHours: true,
        patient: {
          select: {
            userId: true,
            user: { select: { accountStatus: true } },
          },
        },
      },
      orderBy: { connectedAt: 'asc' },
      take: 1_000,
    });
    let warned = 0;

    for (const device of devices) {
      const referenceTime = device.lastSyncAt ?? device.connectedAt;
      const staleAt = new Date(
        referenceTime.getTime() + device.syncWarningAfterHours * 60 * 60_000,
      );
      if (staleAt.getTime() > now.getTime()) continue;

      const claimed = await this.prisma.wearableDevice.updateMany({
        where: {
          id: device.id,
          active: true,
          staleNotificationSentAt: null,
          lastSyncAt: device.lastSyncAt,
        },
        data: { staleNotificationSentAt: now },
      });
      if (claimed.count !== 1) continue;

      try {
        await this.notifications.notifyWearableSyncStale({
          userId: device.patient.userId,
          deviceId: device.id,
          deviceName: device.deviceName,
          provider: device.provider,
          referenceTime,
          staleAt,
        });
        warned += 1;
      } catch (error) {
        await this.prisma.wearableDevice.updateMany({
          where: { id: device.id, staleNotificationSentAt: now },
          data: { staleNotificationSentAt: null },
        });
        const code =
          error instanceof Error ? error.constructor.name : 'UnknownError';
        this.logger.error(
          `Could not create stale warning for wearable ${device.id} (${code})`,
        );
      }
    }

    return warned;
  }
}
