import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { ClinicalExportsService } from './clinical-exports.service';
import {
  ClinicalExportsController,
  DoctorMonitoringController,
  ReportsController,
} from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, ClinicalAccessModule, HealthAuditModule],
  controllers: [
    ReportsController,
    DoctorMonitoringController,
    ClinicalExportsController,
  ],
  providers: [ReportsService, ClinicalExportsService],
  exports: [ReportsService, ClinicalExportsService],
})
export class ReportsModule {}
