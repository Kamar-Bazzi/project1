import { BadRequestException } from '@nestjs/common';
import {
  HealthGoalDirection,
  HealthGoalMetric,
  HealthGoalProgressSource,
  HealthGoalStatus,
  HealthMetricType,
  Prisma,
} from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthGoalsService } from './health-goals.service';

describe('HealthGoalsService', () => {
  const patient = {
    id: 'patient-id',
    userId: 'patient-user',
    timeZone: 'UTC',
    user: { id: 'patient-user', name: 'Patient', email: 'p@example.com' },
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a non-canonical unit for the selected goal metric', async () => {
    const service = new HealthGoalsService(
      {} as PrismaService,
      {
        getPatientForUser: jest.fn().mockResolvedValue(patient),
      } as unknown as ClinicalAccessService,
      {} as HealthAuditService,
    );

    await expect(
      service.create('patient-user', {
        title: 'Daily walk',
        metric: HealthGoalMetric.DAILY_STEPS,
        direction: HealthGoalDirection.AT_LEAST,
        targetValue: 8_000,
        unit: 'km',
        startDate: '2026-08-01T00:00:00.000Z',
      }),
    ).rejects.toEqual(
      new BadRequestException('unit must be "steps" for DAILY_STEPS goals'),
    );
  });

  it('derives current daily-step progress from today wearable data', async () => {
    const now = new Date();
    const goal = {
      id: 'goal-id',
      patientId: patient.id,
      title: 'Daily walk',
      metric: HealthGoalMetric.DAILY_STEPS,
      direction: HealthGoalDirection.AT_LEAST,
      targetValue: 8_000,
      targetSecondaryValue: null,
      unit: 'steps',
      startDate: new Date(now.getTime() - 86_400_000),
      targetDate: null,
      status: HealthGoalStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      progress: [],
    };
    const healthMetricFindFirst = jest
      .fn<Promise<unknown>, [Prisma.HealthMetricFindFirstArgs]>()
      .mockResolvedValue({
        id: 'metric-id',
        metricType: HealthMetricType.STEPS,
        value: 6_000,
        secondaryValue: null,
        measuredAt: now,
      });
    const service = new HealthGoalsService(
      {
        healthGoal: { findMany: jest.fn().mockResolvedValue([goal]) },
        healthMetric: { findFirst: healthMetricFindFirst },
      } as unknown as PrismaService,
      {
        getPatientForUser: jest.fn().mockResolvedValue(patient),
      } as unknown as ClinicalAccessService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as HealthAuditService,
    );

    const result = await service.findForPatient('patient-user', {});

    expect(result.items[0].currentProgress).toEqual(
      expect.objectContaining({
        value: 6_000,
        source: HealthGoalProgressSource.AUTOMATIC,
        basis: 'latest daily steps wearable metric',
      }),
    );
    expect(result.items[0].progressPercent).toBe(75);
    const arguments_ = healthMetricFindFirst.mock.calls[0]?.[0] as {
      where: { patientId: string; metricType: HealthMetricType };
    };
    expect(arguments_.where.patientId).toBe(patient.id);
    expect(arguments_.where.metricType).toBe(HealthMetricType.STEPS);
  });

  it('supports manual daily activity-minute goals', async () => {
    const now = new Date();
    const created = {
      id: 'activity-goal',
      patientId: patient.id,
      title: 'Move daily',
      metric: HealthGoalMetric.DAILY_ACTIVITY_MINUTES,
      direction: HealthGoalDirection.AT_LEAST,
      targetValue: 30,
      targetSecondaryValue: null,
      unit: 'minutes',
      startDate: now,
      targetDate: null,
      status: HealthGoalStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      progress: [],
    };
    const service = new HealthGoalsService(
      {
        healthGoal: { create: jest.fn().mockResolvedValue(created) },
      } as unknown as PrismaService,
      {
        getPatientForUser: jest.fn().mockResolvedValue(patient),
      } as unknown as ClinicalAccessService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as HealthAuditService,
    );

    const result = await service.create('patient-user', {
      title: 'Move daily',
      metric: HealthGoalMetric.DAILY_ACTIVITY_MINUTES,
      direction: HealthGoalDirection.AT_LEAST,
      targetValue: 30,
      unit: 'minutes',
      startDate: now.toISOString(),
    });
    expect(result.metric).toBe(HealthGoalMetric.DAILY_ACTIVITY_MINUTES);
  });

  it('uses the patient IANA timezone for automatic daily progress windows', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T03:00:00.000Z'));
    const honoluluPatient = { ...patient, timeZone: 'Pacific/Honolulu' };
    const now = new Date();
    const goal = {
      id: 'goal-id',
      patientId: patient.id,
      title: 'Daily walk',
      metric: HealthGoalMetric.DAILY_STEPS,
      direction: HealthGoalDirection.AT_LEAST,
      targetValue: 8_000,
      targetSecondaryValue: null,
      unit: 'steps',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      targetDate: null,
      status: HealthGoalStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      progress: [],
    };
    const healthMetricFindFirst = jest
      .fn<Promise<unknown>, [Prisma.HealthMetricFindFirstArgs]>()
      .mockResolvedValue(null);
    const service = new HealthGoalsService(
      {
        healthGoal: { findMany: jest.fn().mockResolvedValue([goal]) },
        healthMetric: { findFirst: healthMetricFindFirst },
      } as unknown as PrismaService,
      {
        getPatientForUser: jest.fn().mockResolvedValue(honoluluPatient),
      } as unknown as ClinicalAccessService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as HealthAuditService,
    );

    await service.findForPatient('patient-user', {});

    const query = healthMetricFindFirst.mock.calls[0]?.[0];
    expect(query?.where).toEqual(
      expect.objectContaining({
        measuredAt: {
          gte: new Date('2026-08-14T10:00:00.000Z'),
          lt: new Date('2026-08-15T10:00:00.000Z'),
          lte: new Date('2026-08-15T03:00:00.000Z'),
        },
      }),
    );
  });
});
