import { Module } from '@nestjs/common';

import { InAppNotificationChannel } from './in-app-notification.channel';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [InAppNotificationChannel, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
