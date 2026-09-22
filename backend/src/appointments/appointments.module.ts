import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { DoctorAvailabilityController } from './doctor-availability.controller';
import { DoctorAvailabilityService } from './doctor-availability.service';

@Module({
  imports: [AuthModule],
  controllers: [AppointmentsController, DoctorAvailabilityController],
  providers: [AppointmentsService, DoctorAvailabilityService],
  exports: [AppointmentsService, DoctorAvailabilityService],
})
export class AppointmentsModule {}
