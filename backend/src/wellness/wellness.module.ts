import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { WellnessController } from './wellness.controller';
import { WellnessService } from './wellness.service';

@Module({
  imports: [AuthModule, ClinicalAccessModule, HealthAuditModule],
  controllers: [WellnessController],
  providers: [WellnessService],
})
export class WellnessModule {}
