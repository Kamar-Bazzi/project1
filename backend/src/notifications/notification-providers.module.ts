import { Module } from '@nestjs/common';

import { EmailNotificationProvider } from './providers/email-notification.provider';
import { PushNotificationProvider } from './providers/push-notification.provider';

@Module({
  providers: [EmailNotificationProvider, PushNotificationProvider],
  exports: [EmailNotificationProvider, PushNotificationProvider],
})
export class NotificationProvidersModule {}
