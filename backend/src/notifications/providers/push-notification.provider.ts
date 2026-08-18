import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webPush, { PushSubscription } from 'web-push';

import { ProviderSendResult } from './email-notification.provider';

export interface PushNotificationMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProviderSendResult extends ProviderSendResult {
  subscriptionExpired?: boolean;
}

@Injectable()
export class PushNotificationProvider {
  private readonly logger = new Logger(PushNotificationProvider.name);
  private readonly isConfigured: boolean;

  constructor(config: ConfigService) {
    const subject = config.get<string>('WEB_PUSH_SUBJECT');
    const publicKey = config.get<string>('WEB_PUSH_PUBLIC_KEY');
    const privateKey = config.get<string>('WEB_PUSH_PRIVATE_KEY');

    this.isConfigured = Boolean(subject && publicKey && privateKey);

    if (subject && publicKey && privateKey) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
    }
  }

  get configured(): boolean {
    return this.isConfigured;
  }

  async send(
    subscription: PushSubscription,
    message: PushNotificationMessage,
  ): Promise<PushProviderSendResult> {
    if (!this.isConfigured) {
      return { outcome: 'NOT_CONFIGURED' };
    }

    try {
      const result = await webPush.sendNotification(
        subscription,
        JSON.stringify(message),
        {
          TTL: 60 * 60,
          urgency: 'high',
        },
      );

      return {
        outcome: 'DELIVERED',
        providerMessageId: result.headers.location,
      };
    } catch (error) {
      const statusCode = this.statusCode(error);
      const subscriptionExpired = statusCode === 404 || statusCode === 410;
      const errorCode = statusCode
        ? `WEB_PUSH_${statusCode}`
        : 'WEB_PUSH_DELIVERY_FAILED';

      this.logger.warn(`Push delivery failed (${errorCode})`);

      return {
        outcome: 'FAILED',
        errorCode,
        subscriptionExpired,
      };
    }
  }

  private statusCode(error: unknown): number | undefined {
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
    ) {
      return error.statusCode;
    }

    return undefined;
  }
}
