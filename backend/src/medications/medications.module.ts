import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { MedicationInteractionsModule } from '../medication-interactions/medication-interactions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MedicationReminderService } from './medication-reminder.service';
import { MedicationRefillsService } from './medication-refills.service';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    ClinicalAccessModule,
    HealthAuditModule,
    MedicationInteractionsModule,
  ],
  controllers: [MedicationsController],
  providers: [
    MedicationsService,
    MedicationReminderService,
    MedicationRefillsService,
  ],
  exports: [MedicationsService, MedicationReminderService],
})
export class MedicationsModule {}
