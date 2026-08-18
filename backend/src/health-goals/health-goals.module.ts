import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import {
  DoctorHealthGoalsController,
  HealthGoalsController,
} from './health-goals.controller';
import { HealthGoalsService } from './health-goals.service';

@Module({
  imports: [AuthModule, ClinicalAccessModule, HealthAuditModule],
  controllers: [HealthGoalsController, DoctorHealthGoalsController],
  providers: [HealthGoalsService],
  exports: [HealthGoalsService],
})
export class HealthGoalsModule {}
