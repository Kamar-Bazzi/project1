import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { HealthMetricType } from '@prisma/client';
import { validate } from 'class-validator';

import {
  CreateHealthMetricDto,
  SyncHealthMetricItemDto,
} from './create-health-metric.dto';
import { HealthMetricsQueryDto } from './health-metrics-query.dto';
import { SyncHealthMetricsDto } from './sync-health-metrics.dto';

describe('wearable health metric DTOs', () => {
  const validMetric = {
    metricType: HealthMetricType.HEART_RATE,
    value: 78,
    unit: 'bpm',
    measuredAt: '2026-08-08T10:00:00.000Z',
  };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('accepts a valid canonical metric shape', async () => {
    const dto = plainToInstance(CreateHealthMetricDto, validMetric);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts provider timestamps with sub-millisecond ISO precision', async () => {
    const dto = plainToInstance(CreateHealthMetricDto, {
      ...validMetric,
      measuredAt: '2026-08-08T10:00:00.1234567Z',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an invalid metric type', async () => {
    const dto = plainToInstance(CreateHealthMetricDto, {
      ...validMetric,
      metricType: 'MOOD',
    });

    expect((await validate(dto)).map(({ property }) => property)).toContain(
      'metricType',
    );
  });

  it.each([
    '2026-08-08T10:00:00',
    '2026-02-30T10:00:00Z',
    '1999-12-31T23:59:59Z',
    '2026-08-08T12:06:00Z',
  ])(
    'rejects invalid or unreasonable metric timestamp %s',
    async (measuredAt) => {
      const dto = plainToInstance(CreateHealthMetricDto, {
        ...validMetric,
        measuredAt,
      });

      expect((await validate(dto)).map(({ property }) => property)).toContain(
        'measuredAt',
      );
    },
  );

  it('rejects metadata larger than the per-reading safety limit', async () => {
    const dto = plainToInstance(SyncHealthMetricItemDto, {
      ...validMetric,
      metadata: { note: 'x'.repeat(2_100) },
    });

    expect((await validate(dto)).map(({ property }) => property)).toContain(
      'metadata',
    );
  });

  it('rejects an oversized synchronization batch', async () => {
    const dto = plainToInstance(SyncHealthMetricsDto, {
      wearableDeviceId: '11aa22bb-33cc-44dd-88ee-112233445566',
      measurements: Array.from({ length: 101 }, (_, index) => ({
        ...validMetric,
        externalRecordId: `record-${index}`,
      })),
    });

    expect((await validate(dto)).map(({ property }) => property)).toContain(
      'measurements',
    );
  });

  it('transforms and bounds the history query limit', async () => {
    const valid = plainToInstance(HealthMetricsQueryDto, { limit: '500' });
    const invalid = plainToInstance(HealthMetricsQueryDto, { limit: '501' });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid.limit).toBe(500);
    expect((await validate(invalid)).map(({ property }) => property)).toContain(
      'limit',
    );
  });

  it('rejects null metric query filters rather than silently ignoring them', async () => {
    const dto = plainToInstance(HealthMetricsQueryDto, {
      metricType: null,
      from: null,
      to: null,
      limit: null,
    });

    expect((await validate(dto)).map(({ property }) => property)).toEqual(
      expect.arrayContaining(['metricType', 'from', 'to', 'limit']),
    );
  });
});
