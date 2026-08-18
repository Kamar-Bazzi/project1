import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HealthGoalDirection,
  HealthGoalMetric,
  HealthGoalProgressSource,
  HealthGoalStatus,
  HealthMetricType,
  MeasurementType,
  Prisma,
} from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { getLocalDayUtcRange } from '../common/time-zone/local-day';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateHealthGoalDto,
  CreateHealthGoalProgressDto,
  HealthGoalQueryDto,
  UpdateHealthGoalDto,
} from './dto/health-goal.dto';

const GOAL_UNITS: Record<HealthGoalMetric, string> = {
  [HealthGoalMetric.WEIGHT]: 'kg',
  [HealthGoalMetric.DAILY_STEPS]: 'steps',
  [HealthGoalMetric.DAILY_ACTIVITY_MINUTES]: 'minutes',
  [HealthGoalMetric.HEART_RATE]: 'bpm',
  [HealthGoalMetric.BLOOD_PRESSURE]: 'mmHg',
  [HealthGoalMetric.BLOOD_GLUCOSE]: 'mg/dL',
  [HealthGoalMetric.OXYGEN_SATURATION]: '%',
  [HealthGoalMetric.SLEEP_DURATION]: 'minutes',
  [HealthGoalMetric.MEDICATION_ADHERENCE]: '%',
};

const goalInclude = {
  progress: {
    orderBy: [{ recordedAt: 'desc' as const }, { createdAt: 'desc' as const }],
    take: 30,
  },
} satisfies Prisma.HealthGoalInclude;

export interface DerivedGoalProgress {
  value: number;
  secondaryValue: number | null;
  recordedAt: Date;
  source: HealthGoalProgressSource;
  basis: string;
}

@Injectable()
export class HealthGoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
  ) {}

  async findForPatient(userId: string, query: HealthGoalQueryDto) {
    const patient = await this.access.getPatientForUser(userId);
    return this.findForPatientId(patient.id, patient.timeZone, query, userId);
  }

  async findForDoctor(
    doctorUserId: string,
    patientId: string,
    query: HealthGoalQueryDto,
  ) {
    const { patient } = await this.access.requireAssignedPatient(
      doctorUserId,
      patientId,
    );
    return this.findForPatientId(
      patientId,
      patient.timeZone,
      query,
      doctorUserId,
    );
  }

  async findOne(userId: string, goalId: string) {
    const patient = await this.access.getPatientForUser(userId);
    const goal = await this.prisma.healthGoal.findFirst({
      where: { id: goalId, patientId: patient.id },
      include: goalInclude,
    });
    if (!goal) throw new NotFoundException('Health goal not found');
    return this.withProgress(
      goal,
      await this.deriveProgress(patient.id, patient.timeZone, goal),
    );
  }

  async create(userId: string, dto: CreateHealthGoalDto) {
    const patient = await this.access.getPatientForUser(userId);
    this.assertGoal(dto);
    const goal = await this.prisma.healthGoal.create({
      data: {
        patientId: patient.id,
        title: dto.title,
        metric: dto.metric,
        direction: dto.direction,
        targetValue: dto.targetValue,
        targetSecondaryValue: dto.targetSecondaryValue ?? null,
        unit: dto.unit,
        startDate: new Date(dto.startDate),
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      },
      include: goalInclude,
    });
    await this.audit.record({
      userId,
      action: 'HEALTH_GOAL_CREATED',
      entity: 'HealthGoal',
      entityId: goal.id,
      metadata: {
        patientId: patient.id,
        goalId: goal.id,
        goalMetric: goal.metric,
        goalStatus: goal.status,
      },
    });
    return this.withProgress(goal);
  }

  async update(userId: string, goalId: string, dto: UpdateHealthGoalDto) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one goal field is required');
    }
    const patient = await this.access.getPatientForUser(userId);
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.healthGoal.findFirst({
        where: { id: goalId, patientId: patient.id },
        include: goalInclude,
      });
      if (!existing) throw new NotFoundException('Health goal not found');
      if (
        existing.status === HealthGoalStatus.CANCELLED &&
        dto.status !== undefined &&
        dto.status !== HealthGoalStatus.CANCELLED
      ) {
        throw new BadRequestException('Cancelled goals cannot be reactivated');
      }

      const resulting = {
        metric: dto.metric ?? existing.metric,
        direction: dto.direction ?? existing.direction,
        targetValue: dto.targetValue ?? existing.targetValue,
        targetSecondaryValue:
          dto.targetSecondaryValue === undefined
            ? existing.targetSecondaryValue
            : dto.targetSecondaryValue,
        unit: dto.unit ?? existing.unit,
        startDate: dto.startDate ? new Date(dto.startDate) : existing.startDate,
        targetDate:
          dto.targetDate === undefined
            ? existing.targetDate
            : dto.targetDate === null
              ? null
              : new Date(dto.targetDate),
      };
      this.assertGoal(resulting);

      const goal = await transaction.healthGoal.update({
        where: { id: existing.id },
        data: {
          title: dto.title,
          metric: dto.metric,
          direction: dto.direction,
          targetValue: dto.targetValue,
          targetSecondaryValue: dto.targetSecondaryValue,
          unit: dto.unit,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          targetDate:
            dto.targetDate === undefined
              ? undefined
              : dto.targetDate === null
                ? null
                : new Date(dto.targetDate),
          status: dto.status,
        },
        include: goalInclude,
      });
      await this.audit.record(
        {
          userId,
          action: 'HEALTH_GOAL_UPDATED',
          entity: 'HealthGoal',
          entityId: goal.id,
          metadata: {
            patientId: patient.id,
            goalId: goal.id,
            goalMetric: goal.metric,
            goalStatus: goal.status,
          },
        },
        transaction,
      );
      return this.withProgress(goal);
    });
  }

  async cancel(userId: string, goalId: string): Promise<void> {
    const patient = await this.access.getPatientForUser(userId);
    const result = await this.prisma.healthGoal.updateMany({
      where: {
        id: goalId,
        patientId: patient.id,
        status: { not: HealthGoalStatus.CANCELLED },
      },
      data: { status: HealthGoalStatus.CANCELLED },
    });
    if (result.count === 0) {
      const exists = await this.prisma.healthGoal.count({
        where: { id: goalId, patientId: patient.id },
      });
      if (exists === 0) throw new NotFoundException('Health goal not found');
    }
    await this.audit.record({
      userId,
      action: 'HEALTH_GOAL_CANCELLED',
      entity: 'HealthGoal',
      entityId: goalId,
      metadata: { patientId: patient.id, goalId },
    });
  }

  async addProgress(
    userId: string,
    goalId: string,
    dto: CreateHealthGoalProgressDto,
  ) {
    const patient = await this.access.getPatientForUser(userId);
    const recordedAt = new Date(dto.recordedAt);
    if (recordedAt.getTime() > Date.now()) {
      throw new BadRequestException('recordedAt cannot be in the future');
    }

    return this.prisma.$transaction(async (transaction) => {
      const goal = await transaction.healthGoal.findFirst({
        where: { id: goalId, patientId: patient.id },
      });
      if (!goal) throw new NotFoundException('Health goal not found');
      if (goal.status === HealthGoalStatus.CANCELLED) {
        throw new BadRequestException(
          'Progress cannot be added to a cancelled goal',
        );
      }
      if (
        goal.metric === HealthGoalMetric.BLOOD_PRESSURE &&
        dto.secondaryValue == null
      ) {
        throw new BadRequestException(
          'secondaryValue is required for blood pressure progress',
        );
      }
      if (recordedAt.getTime() < goal.startDate.getTime()) {
        throw new BadRequestException(
          'recordedAt cannot be before the goal startDate',
        );
      }

      const progress = await transaction.healthGoalProgress.create({
        data: {
          healthGoalId: goal.id,
          value: dto.value,
          secondaryValue: dto.secondaryValue ?? null,
          note: dto.note ?? null,
          recordedAt,
          source: HealthGoalProgressSource.MANUAL,
        },
      });
      await this.audit.record(
        {
          userId,
          action: 'HEALTH_GOAL_PROGRESS_RECORDED',
          entity: 'HealthGoalProgress',
          entityId: progress.id,
          metadata: {
            patientId: patient.id,
            goalId: goal.id,
            progressId: progress.id,
            goalMetric: goal.metric,
          },
        },
        transaction,
      );
      return progress;
    });
  }

  private async findForPatientId(
    patientId: string,
    timeZone: string | null,
    query: HealthGoalQueryDto,
    actorUserId: string,
  ) {
    const goals = await this.prisma.healthGoal.findMany({
      where: { patientId, status: query.status, metric: query.metric },
      include: goalInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    await this.audit.record({
      userId: actorUserId,
      action: 'HEALTH_GOAL_LIST_ACCESSED',
      entity: 'HealthGoal',
      metadata: { patientId, count: goals.length },
    });
    const items = await Promise.all(
      goals.map(async (goal) =>
        this.withProgress(
          goal,
          await this.deriveProgress(patientId, timeZone, goal),
        ),
      ),
    );
    return { items };
  }

  private assertGoal(goal: {
    metric: HealthGoalMetric;
    direction: HealthGoalDirection;
    targetValue: number;
    targetSecondaryValue?: number | null;
    unit: string;
    startDate: string | Date;
    targetDate?: string | Date | null;
  }): void {
    const canonicalUnit = GOAL_UNITS[goal.metric];
    if (goal.unit !== canonicalUnit) {
      throw new BadRequestException(
        `unit must be "${canonicalUnit}" for ${goal.metric} goals`,
      );
    }
    if (
      (goal.direction === HealthGoalDirection.BETWEEN ||
        goal.metric === HealthGoalMetric.BLOOD_PRESSURE) &&
      goal.targetSecondaryValue == null
    ) {
      throw new BadRequestException(
        'targetSecondaryValue is required for this goal',
      );
    }
    if (
      goal.direction === HealthGoalDirection.BETWEEN &&
      goal.targetSecondaryValue != null &&
      goal.targetSecondaryValue <= goal.targetValue
    ) {
      throw new BadRequestException(
        'targetSecondaryValue must be greater than targetValue for BETWEEN goals',
      );
    }
    const startDate = new Date(goal.startDate);
    const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;
    if (targetDate && targetDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('targetDate cannot be before startDate');
    }
  }

  private withProgress<
    T extends {
      direction: HealthGoalDirection;
      targetValue: number;
      targetSecondaryValue: number | null;
      targetDate: Date | null;
      progress: Array<{
        value: number;
        secondaryValue: number | null;
        recordedAt: Date;
      }>;
    },
  >(goal: T, derivedProgress: DerivedGoalProgress | null = null) {
    const latestManual = goal.progress[0] ?? null;
    const latest =
      derivedProgress &&
      (!latestManual || derivedProgress.recordedAt > latestManual.recordedAt)
        ? derivedProgress
        : latestManual;
    const currentValue = latest?.value ?? null;
    let progressPercent: number | null = null;
    let isOnTrack: boolean | null = null;
    if (currentValue !== null) {
      if (goal.direction === HealthGoalDirection.AT_LEAST) {
        progressPercent = (currentValue / goal.targetValue) * 100;
        isOnTrack = currentValue >= goal.targetValue;
      } else if (goal.direction === HealthGoalDirection.AT_MOST) {
        progressPercent =
          currentValue <= goal.targetValue
            ? 100
            : (goal.targetValue / currentValue) * 100;
        isOnTrack = currentValue <= goal.targetValue;
      } else {
        const upper = goal.targetSecondaryValue ?? goal.targetValue;
        isOnTrack = currentValue >= goal.targetValue && currentValue <= upper;
        progressPercent = isOnTrack
          ? 100
          : currentValue < goal.targetValue
            ? (currentValue / goal.targetValue) * 100
            : (upper / currentValue) * 100;
      }
    }

    return {
      ...goal,
      currentProgress: latest,
      progressPercent:
        progressPercent === null
          ? null
          : Math.max(0, Math.min(100, Math.round(progressPercent * 10) / 10)),
      isOnTrack,
      remainingDays: goal.targetDate
        ? Math.max(
            0,
            Math.ceil(
              (goal.targetDate.getTime() - Date.now()) / (24 * 60 * 60 * 1_000),
            ),
          )
        : null,
    };
  }

  private async deriveProgress(
    patientId: string,
    timeZone: string | null,
    goal: {
      id: string;
      metric: HealthGoalMetric;
      startDate: Date;
    },
  ): Promise<DerivedGoalProgress | null> {
    const now = new Date();
    const today = getLocalDayUtcRange(now, timeZone);

    if (goal.metric === HealthGoalMetric.DAILY_STEPS) {
      const metric = await this.prisma.healthMetric.findFirst({
        where: {
          patientId,
          metricType: HealthMetricType.STEPS,
          measuredAt: { gte: today.start, lt: today.end, lte: now },
        },
        orderBy: { measuredAt: 'desc' },
      });
      return metric
        ? this.automaticProgress(
            metric.value,
            metric.secondaryValue,
            metric.measuredAt,
            'latest daily steps wearable metric',
          )
        : null;
    }

    if (goal.metric === HealthGoalMetric.SLEEP_DURATION) {
      const metric = await this.prisma.healthMetric.findFirst({
        where: {
          patientId,
          metricType: HealthMetricType.SLEEP_DURATION,
          measuredAt: { gte: goal.startDate, lte: now },
        },
        orderBy: { measuredAt: 'desc' },
      });
      return metric
        ? this.automaticProgress(
            metric.value,
            metric.secondaryValue,
            metric.measuredAt,
            'latest sleep duration wearable metric',
          )
        : null;
    }

    if (goal.metric === HealthGoalMetric.WEIGHT) {
      const [measurement, metric] = await Promise.all([
        this.prisma.measurement.findFirst({
          where: {
            patientId,
            type: MeasurementType.WEIGHT,
            measuredAt: { gte: goal.startDate, lte: now },
          },
          orderBy: { measuredAt: 'desc' },
        }),
        this.prisma.healthMetric.findFirst({
          where: {
            patientId,
            metricType: HealthMetricType.WEIGHT,
            measuredAt: { gte: goal.startDate, lte: now },
          },
          orderBy: { measuredAt: 'desc' },
        }),
      ]);
      if (!measurement && !metric) return null;
      if (
        measurement &&
        (!metric || measurement.measuredAt >= metric.measuredAt)
      ) {
        return this.automaticProgress(
          measurement.value,
          measurement.secondaryValue,
          measurement.measuredAt,
          'latest weight measurement',
        );
      }
      if (!metric) return null;
      return this.automaticProgress(
        metric.value,
        metric.secondaryValue,
        metric.measuredAt,
        'latest weight wearable metric',
      );
    }

    if (goal.metric === HealthGoalMetric.MEDICATION_ADHERENCE) {
      const periodStart =
        goal.startDate > today.start ? goal.startDate : today.start;
      const logs = await this.prisma.medicationLog.findMany({
        where: {
          medication: { patientId },
          scheduledFor: { gte: periodStart, lt: today.end, lte: now },
        },
        select: { status: true, scheduledFor: true },
        orderBy: { scheduledFor: 'desc' },
      });
      const eligible = logs.filter((log) =>
        ['TAKEN', 'MISSED', 'SKIPPED'].includes(log.status),
      );
      if (eligible.length === 0) return null;
      const taken = eligible.filter((log) => log.status === 'TAKEN').length;
      return this.automaticProgress(
        Math.round((taken / eligible.length) * 1_000) / 10,
        null,
        eligible[0].scheduledFor,
        'today recorded medication doses',
      );
    }

    return null;
  }

  private automaticProgress(
    value: number,
    secondaryValue: number | null,
    recordedAt: Date,
    basis: string,
  ): DerivedGoalProgress {
    return {
      value,
      secondaryValue,
      recordedAt,
      source: HealthGoalProgressSource.AUTOMATIC,
      basis,
    };
  }
}
