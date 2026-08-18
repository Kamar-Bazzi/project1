import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export interface EmailNotificationMessage {
  recipients: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface ProviderSendResult {
  outcome: 'DELIVERED' | 'NOT_CONFIGURED' | 'FAILED';
  providerMessageId?: string;
  errorCode?: string;
}

@Injectable()
export class EmailNotificationProvider {
  private readonly logger = new Logger(EmailNotificationProvider.name);
  private readonly fromAddress: string | undefined;
  private readonly transporter: Transporter<
    SMTPTransport.SentMessageInfo,
    SMTPTransport.Options
  > | null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const fromAddress = this.config.get<string>('SMTP_FROM');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');

    this.fromAddress = fromAddress;

    if (!host || !fromAddress || !Number.isInteger(port)) {
      this.transporter = null;
      return;
    }

    const username = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');

    const transportOptions: SMTPTransport.Options = {
      host,
      port,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      requireTLS: this.config.get<string>('SMTP_REQUIRE_TLS') !== 'false',
      auth:
        username && password
          ? {
              user: username,
              pass: password,
            }
          : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    };

    this.transporter = nodemailer.createTransport(transportOptions);
  }

  get configured(): boolean {
    return this.transporter !== null && this.fromAddress !== undefined;
  }

  async send(message: EmailNotificationMessage): Promise<ProviderSendResult> {
    const recipients = [
      ...new Set(message.recipients.map((email) => email.trim().toLowerCase())),
    ].filter(Boolean);

    if (recipients.length === 0 || !this.transporter || !this.fromAddress) {
      return { outcome: 'NOT_CONFIGURED' };
    }

    try {
      const result = await this.transporter.sendMail({
        from: this.fromAddress,
        to: recipients,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      return {
        outcome: 'DELIVERED',
        providerMessageId: result.messageId,
      };
    } catch (error) {
      const errorCode = this.safeErrorCode(error);
      this.logger.error(`Email delivery failed (${errorCode})`);

      return {
        outcome: 'FAILED',
        errorCode,
      };
    }
  }

  private safeErrorCode(error: unknown): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return error.code.slice(0, 80);
    }

    return 'SMTP_DELIVERY_FAILED';
  }
}
