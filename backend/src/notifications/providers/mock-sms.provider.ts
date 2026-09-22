import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  SmsNotificationMessage,
  SmsProvider,
  SmsProviderSendResult,
} from './sms.provider';

@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return this.config.get<string>('SMS_PROVIDER') === 'mock';
  }

  send(message: SmsNotificationMessage): Promise<SmsProviderSendResult> {
    const recipients = normalizedRecipients(message.recipients);

    if (!this.configured || recipients.length === 0) {
      return Promise.resolve({ outcome: 'NOT_CONFIGURED' });
    }

    if (this.config.get<string>('SMS_MOCK_FORCE_FAILURE') === 'true') {
      this.logger.warn('Mock SMS delivery failed (SMS_MOCK_FORCED_FAILURE)');
      return Promise.resolve({
        outcome: 'FAILED',
        errorCode: 'SMS_MOCK_FORCED_FAILURE',
      });
    }

    this.logger.log(`Mock SMS delivered to ${recipients.length} recipient(s).`);

    return Promise.resolve({
      outcome: 'DELIVERED',
      providerMessageId: `mock-sms:${Date.now()}`,
    });
  }
}

function normalizedRecipients(recipients: string[]): string[] {
  return [...new Set(recipients.map((recipient) => recipient.trim()))].filter(
    Boolean,
  );
}
