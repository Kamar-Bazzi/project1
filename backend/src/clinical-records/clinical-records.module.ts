import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import {
  DoctorClinicalRecordsController,
  PatientClinicalRecordsController,
} from './clinical-records.controller';
import { ClinicalRecordsService } from './clinical-records.service';

@Module({
  imports: [AuthModule, ClinicalAccessModule, HealthAuditModule],
  controllers: [
    DoctorClinicalRecordsController,
    PatientClinicalRecordsController,
  ],
  providers: [ClinicalRecordsService],
  exports: [ClinicalRecordsService],
})
export class ClinicalRecordsModule {}
