import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WearableProvidersModule } from './wearable-providers.module';
import { WearableSyncMonitorService } from './wearable-sync-monitor.service';
import { WearablesController } from './wearables.controller';
import { WearablesService } from './wearables.service';

@Module({
  imports: [
    AuthModule,
    HealthAuditModule,
    NotificationsModule,
    WearableProvidersModule,
  ],
  controllers: [WearablesController],
  providers: [WearablesService, WearableSyncMonitorService],
  exports: [WearablesService, WearableProvidersModule],
})
export class WearablesModule {}
