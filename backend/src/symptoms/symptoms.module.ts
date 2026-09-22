import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import {
  DoctorSymptomsController,
  SymptomsController,
} from './symptoms.controller';
import { SymptomsService } from './symptoms.service';

@Module({
  imports: [AuthModule, ClinicalAccessModule, HealthAuditModule],
  controllers: [SymptomsController, DoctorSymptomsController],
  providers: [SymptomsService],
})
export class SymptomsModule {}
