import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import {
  DoctorFollowUpPlansController,
  PatientFollowUpPlansController,
} from './follow-up-plans.controller';
import { FollowUpPlansService } from './follow-up-plans.service';

@Module({
  imports: [AuthModule, ClinicalAccessModule, HealthAuditModule],
  controllers: [DoctorFollowUpPlansController, PatientFollowUpPlansController],
  providers: [FollowUpPlansService],
  exports: [FollowUpPlansService],
})
export class FollowUpPlansModule {}
