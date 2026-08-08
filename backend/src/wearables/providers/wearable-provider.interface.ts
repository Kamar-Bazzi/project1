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

/**
 * A provider adapter normalizes vendor-specific data into the application's
 * provider-neutral health metric shape. Real adapters may be backed by a
 * companion mobile application or an OAuth provider API.
 */
export interface WearableProviderAdapter {
  readonly provider: WearableProvider;
  readonly isDemo: boolean;

  generateDemoMeasurements?(
    device: WearableProviderDevice,
    now?: Date,
  ): WearableProviderMeasurement[];
}
