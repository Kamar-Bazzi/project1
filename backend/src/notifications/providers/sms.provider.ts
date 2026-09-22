export interface SmsNotificationMessage {
  recipients: string[];
  body: string;
}

export interface SmsProviderSendResult {
  outcome: 'DELIVERED' | 'NOT_CONFIGURED' | 'FAILED';
  providerMessageId?: string;
  errorCode?: string;
}

export interface SmsProvider {
  readonly configured: boolean;
  send(message: SmsNotificationMessage): Promise<SmsProviderSendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
