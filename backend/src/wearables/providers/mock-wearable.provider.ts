import { Injectable } from '@nestjs/common';
import {
  HealthMetricSource,
  HealthMetricType,
  WearableProvider,
} from '@prisma/client';

import {
  WearableProviderAdapter,
  WearableProviderDevice,
  WearableProviderMeasurement,
} from './wearable-provider.interface';

const MOCK_TIME_BUCKET_MS = 5 * 60 * 1000;
export const MOCK_HEALTH_DATA_DISCLAIMER =
  'Generated demo data; not a real medical reading.';

interface MockMetricDefinition {
  metricType: HealthMetricType;
  value: number;
  unit: string;
  aggregation: string;
}

@Injectable()
export class MockWearableProvider implements WearableProviderAdapter {
  readonly provider = WearableProvider.MOCK;
  readonly isDemo = true;

  generateDemoMeasurements(
    device: WearableProviderDevice,
    now = new Date(),
  ): WearableProviderMeasurement[] {
    const measuredAt = this.getBucketStart(now);
    const externalDeviceKey = device.externalDeviceId ?? device.id;
    const seedKey = `${device.id}:${externalDeviceKey}`;
    const steps = this.integerBetween(
      `${seedKey}:${measuredAt.toISOString()}:steps`,
      2_500,
      11_500,
    );
    const metricDefinitions: MockMetricDefinition[] = [
      {
        metricType: HealthMetricType.HEART_RATE,
        value: this.integerBetween(
          `${seedKey}:${measuredAt.toISOString()}:heart-rate`,
          64,
          96,
        ),
        unit: 'bpm',
        aggregation: 'instantaneous',
      },
      {
        metricType: HealthMetricType.RESTING_HEART_RATE,
        value: this.integerBetween(
          `${seedKey}:${measuredAt.toISOString()}:resting-heart-rate`,
          55,
          75,
        ),
        unit: 'bpm',
        aggregation: 'daily_estimate',
      },
      {
        metricType: HealthMetricType.STEPS,
        value: steps,
        unit: 'count',
        aggregation: 'today_to_time',
      },
      {
        metricType: HealthMetricType.DISTANCE,
        value: this.round(steps * 0.000_75, 2),
        unit: 'km',
        aggregation: 'today_to_time',
      },
      {
        metricType: HealthMetricType.CALORIES,
        value: Math.round(120 + steps * 0.035),
        unit: 'kcal',
        aggregation: 'today_to_time',
      },
      {
        metricType: HealthMetricType.SLEEP_DURATION,
        value: this.integerBetween(
          `${seedKey}:${measuredAt.toISOString()}:sleep`,
          360,
          510,
        ),
        unit: 'min',
        aggregation: 'previous_sleep_session',
      },
      {
        metricType: HealthMetricType.BLOOD_OXYGEN,
        value: this.integerBetween(
          `${seedKey}:${measuredAt.toISOString()}:blood-oxygen`,
          95,
          99,
        ),
        unit: '%',
        aggregation: 'instantaneous',
      },
    ];

    return metricDefinitions.map((definition) => ({
      metricType: definition.metricType,
      value: definition.value,
      unit: definition.unit,
      measuredAt,
      source: HealthMetricSource.MOCK,
      externalRecordId: [
        'mock',
        externalDeviceKey,
        definition.metricType,
        measuredAt.toISOString(),
      ].join(':'),
      metadata: {
        demo: true,
        disclaimer: MOCK_HEALTH_DATA_DISCLAIMER,
        aggregation: definition.aggregation,
      },
    }));
  }

  private getBucketStart(date: Date): Date {
    const timestamp = date.getTime();
    const bucketTimestamp =
      Math.floor(timestamp / MOCK_TIME_BUCKET_MS) * MOCK_TIME_BUCKET_MS;

    return new Date(bucketTimestamp);
  }

  private integerBetween(seed: string, minimum: number, maximum: number) {
    const normalized = this.seededFraction(seed);

    return minimum + Math.floor(normalized * (maximum - minimum + 1));
  }

  private seededFraction(seed: string): number {
    let hash = 2_166_136_261;

    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }

    return (hash >>> 0) / 4_294_967_296;
  }

  private round(value: number, decimalPlaces: number): number {
    const multiplier = 10 ** decimalPlaces;

    return Math.round(value * multiplier) / multiplier;
  }
}
