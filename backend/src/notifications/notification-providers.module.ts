import { Module } from '@nestjs/common';

import { EmailNotificationProvider } from './providers/email-notification.provider';
import { MockSmsProvider } from './providers/mock-sms.provider';
import { PushNotificationProvider } from './providers/push-notification.provider';
import { SMS_PROVIDER } from './providers/sms.provider';

@Module({
  providers: [
    EmailNotificationProvider,
    PushNotificationProvider,
    MockSmsProvider,
    { provide: SMS_PROVIDER, useExisting: MockSmsProvider },
  ],
  exports: [EmailNotificationProvider, PushNotificationProvider, SMS_PROVIDER],
})
export class NotificationProvidersModule {}
