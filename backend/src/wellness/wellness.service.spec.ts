import { HealthAlertSeverity, HealthMetricType } from '@prisma/client';

import { WellnessService } from './wellness.service';

describe('WellnessService', () => {
  const prisma = {
    medicationLog: { findMany: jest.fn().mockResolvedValue([]) },
    healthMetric: { findMany: jest.fn().mockResolvedValue([]) },
    measurement: { findMany: jest.fn().mockResolvedValue([]) },
    healthAlert: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const access = {
    getPatientForUser: jest
      .fn()
      .mockResolvedValue({ id: 'patient-1', timeZone: 'UTC' }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new WellnessService(
    prisma as never,
    access as never,
    audit as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.medicationLog.findMany.mockResolvedValue([]);
    prisma.healthMetric.findMany.mockResolvedValue([]);
    prisma.measurement.findMany.mockResolvedValue([]);
    prisma.healthAlert.findMany.mockResolvedValue([]);
    access.getPatientForUser.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'UTC',
    });
  });

  it('does not turn an empty record into a perfect wellness score', async () => {
    const result = await service.summary(
      'user-1',
      new Date('2026-08-22T12:00:00.000Z'),
    );

    expect(result.overall).toEqual({
      score: null,
      status: 'NEEDS_DATA',
      availableComponents: 0,
      totalComponents: 6,
    });
    expect(result.components.find(({ key }) => key === 'ALERTS')).toEqual(
      expect.objectContaining({ status: 'ON_TRACK', score: null, value: 0 }),
    );
    expect(result.disclaimer.toLowerCase()).toContain('not a diagnosis');
  });

  it('queries today and the prior six patient-local calendar dates', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');

    const result = await service.summary('user-1', now);

    const expectedFrom = new Date('2026-08-16T00:00:00.000Z');
    expect(prisma.healthMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          measuredAt: { gte: expectedFrom, lte: now },
        }) as unknown,
      }),
    );
    expect(result.period).toEqual({
      days: 7,
      from: expectedFrom,
      to: now,
    });
  });

  it('does not use the alert component as the only basis for an overall score', async () => {
    prisma.healthAlert.findMany.mockResolvedValue([
      {
        severity: HealthAlertSeverity.URGENT,
        metricType: HealthMetricType.BLOOD_OXYGEN,
      },
    ]);

    const result = await service.summary('user-1');

    expect(result.overall.score).toBeNull();
    expect(result.components.find(({ key }) => key === 'ALERTS')).toEqual(
      expect.objectContaining({ score: 25, status: 'REVIEW' }),
    );
  });

  it('buckets activity coverage by the patient local calendar day', async () => {
    access.getPatientForUser.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'Pacific/Honolulu',
    });
    prisma.healthMetric.findMany.mockResolvedValue([
      {
        metricType: HealthMetricType.STEPS,
        value: 1_000,
        measuredAt: new Date('2026-08-22T08:30:00.000Z'),
      },
      {
        metricType: HealthMetricType.STEPS,
        value: 2_000,
        measuredAt: new Date('2026-08-22T11:30:00.000Z'),
      },
    ]);

    const result = await service.summary(
      'user-1',
      new Date('2026-08-22T12:00:00.000Z'),
    );

    expect(result.components.find(({ key }) => key === 'ACTIVITY')).toEqual(
      expect.objectContaining({
        score: 29,
        status: 'REVIEW',
        value: 1_500,
        summary: 'Step data was recorded on 2 of 7 days.',
      }),
    );
  });

  it('uses one cumulative step snapshot per local day', async () => {
    prisma.healthMetric.findMany.mockResolvedValue([
      {
        metricType: HealthMetricType.STEPS,
        value: 1_000,
        measuredAt: new Date('2026-08-21T08:00:00.000Z'),
      },
      {
        metricType: HealthMetricType.STEPS,
        value: 3_500,
        measuredAt: new Date('2026-08-21T18:00:00.000Z'),
      },
      {
        metricType: HealthMetricType.STEPS,
        value: 500,
        measuredAt: new Date('2026-08-22T08:00:00.000Z'),
      },
    ]);

    const result = await service.summary(
      'user-1',
      new Date('2026-08-22T12:00:00.000Z'),
    );

    expect(result.components.find(({ key }) => key === 'ACTIVITY')).toEqual(
      expect.objectContaining({
        value: 2_000,
        dataPoints: 3,
        summary: 'Step data was recorded on 2 of 7 days.',
      }),
    );
  });

  it('buckets sleep coverage by the patient local calendar day', async () => {
    access.getPatientForUser.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'Asia/Beirut',
    });
    prisma.healthMetric.findMany.mockResolvedValue([
      {
        metricType: HealthMetricType.SLEEP_DURATION,
        value: 420,
        measuredAt: new Date('2026-08-21T22:30:00.000Z'),
      },
      {
        metricType: HealthMetricType.SLEEP_DURATION,
        value: 480,
        measuredAt: new Date('2026-08-22T00:30:00.000Z'),
      },
    ]);

    const result = await service.summary(
      'user-1',
      new Date('2026-08-22T12:00:00.000Z'),
    );

    expect(result.components.find(({ key }) => key === 'SLEEP')).toEqual(
      expect.objectContaining({
        score: 14,
        status: 'REVIEW',
        value: 7.5,
        summary: 'Sleep data was recorded on 1 of 7 days.',
      }),
    );
  });
});
