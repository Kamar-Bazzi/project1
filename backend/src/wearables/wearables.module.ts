import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { WearableProvidersModule } from './wearable-providers.module';
import { WearablesController } from './wearables.controller';
import { WearablesService } from './wearables.service';

@Module({
  imports: [AuthModule, HealthAuditModule, WearableProvidersModule],
  controllers: [WearablesController],
  providers: [WearablesService],
  exports: [WearablesService, WearableProvidersModule],
})
export class WearablesModule {}
