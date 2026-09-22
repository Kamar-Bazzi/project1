import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { CheckInsModule } from './check-ins/check-ins.module';
import { ClinicalRecordsModule } from './clinical-records/clinical-records.module';
import { AuditedThrottlerGuard } from './common/security/audited-throttler.guard';
import { DoctorModule } from './doctor/doctor.module';
import { DocumentsModule } from './documents/documents.module';
import { EmergencyContactsModule } from './emergency-contacts/emergency-contacts.module';
import { EmergencyEventsModule } from './emergency-events/emergency-events.module';
import { HealthAlertsModule } from './health-alerts/health-alerts.module';
import { HealthMetricsModule } from './health-metrics/health-metrics.module';
import { HealthGoalsModule } from './health-goals/health-goals.module';
import { FollowUpPlansModule } from './follow-up-plans/follow-up-plans.module';
import { MedicalHistoryModule } from './medical-history/medical-history.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { MedicationsModule } from './medications/medications.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ReportsModule } from './reports/reports.module';
import { SymptomsModule } from './symptoms/symptoms.module';
import { WearablesModule } from './wearables/wearables.module';
import { WellnessModule } from './wellness/wellness.module';

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
    CheckInsModule,
    AppointmentsModule,
    DoctorModule,
    DocumentsModule,
    AdminModule,
    ClinicalRecordsModule,
    FollowUpPlansModule,
    MedicalHistoryModule,
    HealthGoalsModule,
    EmergencyEventsModule,
    ReportsModule,
    PrivacyModule,
    SymptomsModule,
    NotificationsModule,
    PatientsModule,
    MedicationsModule,
    MeasurementsModule,
    WearablesModule,
    HealthMetricsModule,
    HealthAlertsModule,
    WellnessModule,
    EmergencyContactsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuditedThrottlerGuard,
    },
  ],
})
export class AppModule {}
