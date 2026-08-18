import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InAppNotificationChannel } from './in-app-notification.channel';
import { NotificationProvidersModule } from './notification-providers.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AppointmentReminderService } from './appointment-reminder.service';

@Module({
  imports: [AuthModule, NotificationProvidersModule],
  controllers: [NotificationsController],
  providers: [
    InAppNotificationChannel,
    NotificationsService,
    AppointmentReminderService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
