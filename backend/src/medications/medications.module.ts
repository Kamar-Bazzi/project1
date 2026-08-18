import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MedicationReminderService } from './medication-reminder.service';
import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [MedicationsController],
  providers: [MedicationsService, MedicationReminderService],
  exports: [MedicationsService, MedicationReminderService],
})
export class MedicationsModule {}
