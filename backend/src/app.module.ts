import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { ClinicalRecordsModule } from './clinical-records/clinical-records.module';
import { DoctorModule } from './doctor/doctor.module';
import { EmergencyContactsModule } from './emergency-contacts/emergency-contacts.module';
import { EmergencyEventsModule } from './emergency-events/emergency-events.module';
import { HealthAlertsModule } from './health-alerts/health-alerts.module';
import { HealthMetricsModule } from './health-metrics/health-metrics.module';
import { HealthGoalsModule } from './health-goals/health-goals.module';
import { MedicalHistoryModule } from './medical-history/medical-history.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { MedicationsModule } from './medications/medications.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { WearablesModule } from './wearables/wearables.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AppointmentsModule,
    DoctorModule,
    AdminModule,
    ClinicalRecordsModule,
    MedicalHistoryModule,
    HealthGoalsModule,
    EmergencyEventsModule,
    ReportsModule,
    NotificationsModule,
    PatientsModule,
    MedicationsModule,
    MeasurementsModule,
    WearablesModule,
    HealthMetricsModule,
    HealthAlertsModule,
    EmergencyContactsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
