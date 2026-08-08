import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { EmergencyContactsModule } from './emergency-contacts/emergency-contacts.module';
import { HealthAlertsModule } from './health-alerts/health-alerts.module';
import { HealthMetricsModule } from './health-metrics/health-metrics.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { MedicationsModule } from './medications/medications.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
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
    PrismaModule,
    AuthModule,
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
