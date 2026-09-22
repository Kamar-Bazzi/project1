import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import {
  CheckInsController,
  DoctorCheckInsController,
} from './check-ins.controller';
import { CheckInsService } from './check-ins.service';

@Module({
  imports: [AuthModule, ClinicalAccessModule, HealthAuditModule],
  controllers: [CheckInsController, DoctorCheckInsController],
  providers: [CheckInsService],
})
export class CheckInsModule {}
