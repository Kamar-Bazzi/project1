import {
  HealthMetricSource,
  HealthMetricType,
  WearableProvider,
} from '@prisma/client';

export interface WearableProviderDevice {
  id: string;
  provider: WearableProvider;
  deviceName: string;
  externalDeviceId: string | null;
}

export interface WearableProviderMeasurement {
  metricType: HealthMetricType;
  value: number;
  secondaryValue?: number;
  unit: string;
  measuredAt: Date;
  source: HealthMetricSource;
  externalRecordId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export type WearableProviderConnectionKind =
  'demo' | 'oauth' | 'native_mobile' | 'unsupported';

export interface WearableProviderContext {
  userId?: string;
  patientId?: string;
}

export interface WearableProviderConnectInput extends WearableProviderContext {
  deviceName?: string;
}

export interface WearableProviderConnection {
  provider: WearableProvider;
  deviceName: string;
  externalDeviceId: string;
}

export interface WearableProviderOperationResult {
  success: true;
}

export interface WearableProviderSyncResult {
  measurements: WearableProviderMeasurement[];
}

export enum WearableProviderErrorCode {
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  AUTHENTICATION_EXPIRED = 'AUTHENTICATION_EXPIRED',
  REFRESH_UNSUPPORTED = 'REFRESH_UNSUPPORTED',
  SYNC_FAILED = 'SYNC_FAILED',
  DISCONNECT_FAILED = 'DISCONNECT_FAILED',
  NORMALIZATION_FAILED = 'NORMALIZATION_FAILED',
  UNSUPPORTED_PROVIDER = 'UNSUPPORTED_PROVIDER',
}

export class WearableProviderError extends Error {
  constructor(
    readonly code: WearableProviderErrorCode,
    message: string,
    readonly retryable = false,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WearableProviderError';
  }
}

/**
 * A provider adapter normalizes vendor-specific data into the application's
 * provider-neutral health metric shape. Real adapters may be backed by a
 * companion mobile application or an OAuth provider API.
 */
export interface WearableProviderAdapter {
  readonly provider: WearableProvider;
  readonly isDemo: boolean;
  readonly supportsConnection: boolean;
  readonly connectionKind: WearableProviderConnectionKind;
  readonly unavailableMessage?: string;

  connect(
    input: WearableProviderConnectInput,
  ): Promise<WearableProviderConnection>;

  disconnect(
    device: WearableProviderDevice,
    context?: WearableProviderContext,
  ): Promise<WearableProviderOperationResult>;

  sync(
    device: WearableProviderDevice,
    context?: WearableProviderContext,
  ): Promise<WearableProviderSyncResult>;

  refreshAuthentication?(
    device: WearableProviderDevice,
    context?: WearableProviderContext,
  ): Promise<WearableProviderOperationResult>;

  normalizeProviderMetrics(rawMetrics: unknown): WearableProviderMeasurement[];

  handleProviderError(error: unknown): WearableProviderError;

  generateDemoMeasurements?(
    device: WearableProviderDevice,
    now?: Date,
  ): WearableProviderMeasurement[];
}
