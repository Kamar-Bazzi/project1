import {
  HealthMetricSource,
  HealthMetricType,
  WearableProvider,
} from '@prisma/client';

import {
  MockWearableProvider,
  MOCK_HEALTH_DATA_DISCLAIMER,
} from './mock-wearable.provider';

describe('MockWearableProvider', () => {
  const provider = new MockWearableProvider();
  const device = {
    id: '69035a9e-8252-44f1-9b63-38429f26c714',
    provider: WearableProvider.MOCK,
    deviceName: 'Demo Watch',
    externalDeviceId: 'demo-watch',
  };

  it('generates all seven supported demo dashboard measurements', () => {
    const measurements = provider.generateDemoMeasurements(
      device,
      new Date('2026-08-08T12:01:00.000Z'),
    );

    expect(measurements).toHaveLength(7);
    expect(measurements.map(({ metricType }) => metricType)).toEqual([
      HealthMetricType.HEART_RATE,
      HealthMetricType.RESTING_HEART_RATE,
      HealthMetricType.STEPS,
      HealthMetricType.DISTANCE,
      HealthMetricType.CALORIES,
      HealthMetricType.SLEEP_DURATION,
      HealthMetricType.BLOOD_OXYGEN,
    ]);
    expect(measurements.map(({ unit }) => unit)).toEqual([
      'bpm',
      'bpm',
      'count',
      'km',
      'kcal',
      'min',
      '%',
    ]);
  });

  it('labels every value as generated mock data, not a medical reading', () => {
    const measurements = provider.generateDemoMeasurements(device);

    for (const measurement of measurements) {
      expect(measurement.source).toBe(HealthMetricSource.MOCK);
      expect(measurement.metadata).toEqual(
        expect.objectContaining({
          demo: true,
          disclaimer: MOCK_HEALTH_DATA_DISCLAIMER,
        }),
      );
      expect(measurement.externalRecordId).toContain('mock:demo-watch:');
    }
  });

  it('uses realistic demo ranges and canonical units', () => {
    const byType = Object.fromEntries(
      provider
        .generateDemoMeasurements(device, new Date('2026-08-08T12:01:00.000Z'))
        .map((measurement) => [measurement.metricType, measurement]),
    );

    expect(byType[HealthMetricType.HEART_RATE].value).toBeGreaterThanOrEqual(
      64,
    );
    expect(byType[HealthMetricType.HEART_RATE].value).toBeLessThanOrEqual(96);
    expect(
      byType[HealthMetricType.RESTING_HEART_RATE].value,
    ).toBeGreaterThanOrEqual(55);
    expect(
      byType[HealthMetricType.RESTING_HEART_RATE].value,
    ).toBeLessThanOrEqual(75);
    expect(byType[HealthMetricType.STEPS].value).toBeGreaterThanOrEqual(2_500);
    expect(byType[HealthMetricType.STEPS].value).toBeLessThanOrEqual(11_500);
    expect(
      byType[HealthMetricType.SLEEP_DURATION].value,
    ).toBeGreaterThanOrEqual(360);
    expect(byType[HealthMetricType.SLEEP_DURATION].value).toBeLessThanOrEqual(
      510,
    );
    expect(byType[HealthMetricType.BLOOD_OXYGEN].value).toBeGreaterThanOrEqual(
      95,
    );
    expect(byType[HealthMetricType.BLOOD_OXYGEN].value).toBeLessThanOrEqual(99);
  });

  it('produces stable IDs and values within a bucket for duplicate sync detection', () => {
    const first = provider.generateDemoMeasurements(
      device,
      new Date('2026-08-08T12:01:00.000Z'),
    );
    const repeated = provider.generateDemoMeasurements(
      device,
      new Date('2026-08-08T12:04:59.999Z'),
    );
    const nextBucket = provider.generateDemoMeasurements(
      device,
      new Date('2026-08-08T12:05:00.000Z'),
    );

    expect(repeated).toEqual(first);
    expect(
      nextBucket.map(({ externalRecordId }) => externalRecordId),
    ).not.toEqual(first.map(({ externalRecordId }) => externalRecordId));
  });
});
