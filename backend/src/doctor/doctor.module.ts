import { Module } from '@nestjs/common';

import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';

@Module({
  imports: [AuthModule, AppointmentsModule, ClinicalAccessModule],
  controllers: [DoctorController],
  providers: [DoctorService],
  exports: [DoctorService],
})
export class DoctorModule {}
