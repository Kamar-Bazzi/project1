import { Module } from '@nestjs/common';

import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { HealthAlertsModule } from '../health-alerts/health-alerts.module';
import { WearableProvidersModule } from '../wearables/wearable-providers.module';
import { WearablesModule } from '../wearables/wearables.module';
import { HealthMetricsController } from './health-metrics.controller';
import { HealthMetricsService } from './health-metrics.service';

@Module({
  imports: [
    HealthAlertsModule,
    HealthAuditModule,
    WearablesModule,
    WearableProvidersModule,
  ],
  controllers: [HealthMetricsController],
  providers: [HealthMetricsService],
  exports: [HealthMetricsService],
})
export class HealthMetricsModule {}
