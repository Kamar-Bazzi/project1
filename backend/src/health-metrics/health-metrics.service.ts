import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HealthMetric,
  HealthMetricSource,
  HealthMetricType,
  Prisma,
  WearableProvider,
} from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { HealthAlertEvaluatorService } from '../health-alerts/health-alert-evaluator.service';
import { PrismaService } from '../prisma/prisma.service';
import { WearableProviderRegistry } from '../wearables/providers/wearable-provider.registry';
import { MOCK_HEALTH_DATA_DISCLAIMER } from '../wearables/providers/mock-wearable.provider';
import { WearablesService } from '../wearables/wearables.service';
import { CreateHealthMetricDto } from './dto/create-health-metric.dto';
import {
  HEALTH_METRIC_DEFINITIONS,
  MAX_HISTORY_RANGE_MS,
} from './dto/health-metric-validation';
import { HealthMetricsQueryDto } from './dto/health-metrics-query.dto';
import { SyncHealthMetricsDto } from './dto/sync-health-metrics.dto';

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

const healthMetricResponseSelect = {
  id: true,
  wearableDeviceId: true,
  metricType: true,
  value: true,
  secondaryValue: true,
  unit: true,
  measuredAt: true,
  source: true,
  externalRecordId: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.HealthMetricSelect;

export type HealthMetricResponse = Prisma.HealthMetricGetPayload<{
  select: typeof healthMetricResponseSelect;
}>;

const PROVIDER_SOURCES: Record<WearableProvider, HealthMetricSource> = {
  [WearableProvider.MOCK]: HealthMetricSource.MOCK,
  [WearableProvider.HEALTH_CONNECT]: HealthMetricSource.HEALTH_CONNECT,
  [WearableProvider.HEALTHKIT]: HealthMetricSource.HEALTHKIT,
  [WearableProvider.FITBIT]: HealthMetricSource.FITBIT,
  [WearableProvider.GARMIN]: HealthMetricSource.GARMIN,
  [WearableProvider.SAMSUNG]: HealthMetricSource.SAMSUNG,
  [WearableProvider.OTHER]: HealthMetricSource.OTHER,
};

export interface HealthMetricSyncResult {
  receivedCount: number;
  createdCount: number;
  duplicateCount: number;
  lastSyncAt: Date;
  metrics: HealthMetricResponse[];
}

@Injectable()
export class HealthMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertEvaluator: HealthAlertEvaluatorService,
    private readonly healthAudit: HealthAuditService,
    private readonly wearablesService: WearablesService,
    private readonly providerRegistry: WearableProviderRegistry,
  ) {}

  async findAllForPatient(
    userId: string,
    query: HealthMetricsQueryDto,
  ): Promise<HealthMetricResponse[]> {
    const patientId = await this.getPatientId(userId);
    const where = this.buildWhere(patientId, query);
    const metrics = await this.prisma.healthMetric.findMany({
      where,
      select: healthMetricResponseSelect,
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit ?? 100,
    });

    await this.healthAudit.record({
      userId,
      action: 'HEALTH_METRICS_READ',
      entity: 'HealthMetric',
      metadata: {
        metricType: query.metricType ?? null,
        resultCount: metrics.length,
        hasFrom: Boolean(query.from),
        hasTo: Boolean(query.to),
      },
    });

    return metrics;
  }

  async findLatestForPatient(
    userId: string,
    query: HealthMetricsQueryDto,
  ): Promise<HealthMetricResponse[]> {
    const patientId = await this.getPatientId(userId);
    const where = this.buildWhere(patientId, query);
    const metricTypes = (
      query.metricType ? [query.metricType] : Object.values(HealthMetricType)
    ).slice(0, query.limit ?? Object.values(HealthMetricType).length);
    const metrics = (
      await Promise.all(
        metricTypes.map((metricType) =>
          this.prisma.healthMetric.findFirst({
            where: { ...where, metricType },
            select: healthMetricResponseSelect,
            orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
          }),
        ),
      )
    ).filter((metric): metric is HealthMetricResponse => metric !== null);

    await this.healthAudit.record({
      userId,
      action: 'HEALTH_METRICS_LATEST_READ',
      entity: 'HealthMetric',
      metadata: {
        metricType: query.metricType ?? null,
        resultCount: metrics.length,
        hasFrom: Boolean(query.from),
        hasTo: Boolean(query.to),
      },
    });

    return metrics;
  }

  async findHistoryForPatient(
    userId: string,
    query: HealthMetricsQueryDto,
  ): Promise<HealthMetricResponse[]> {
    const patientId = await this.getPatientId(userId);
    const where = this.buildWhere(patientId, query);
    const newestMetrics = await this.prisma.healthMetric.findMany({
      where,
      select: healthMetricResponseSelect,
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit ?? 500,
    });
    const metrics = newestMetrics.reverse();

    await this.healthAudit.record({
      userId,
      action: 'HEALTH_METRICS_HISTORY_READ',
      entity: 'HealthMetric',
      metadata: {
        metricType: query.metricType ?? null,
        resultCount: metrics.length,
        hasFrom: Boolean(query.from),
        hasTo: Boolean(query.to),
      },
    });

    return metrics;
  }

  async createForPatient(
    userId: string,
    dto: CreateHealthMetricDto,
  ): Promise<HealthMetricResponse> {
    const patientId = await this.getPatientId(userId);
    this.assertMetric(dto.metricType, dto.value, dto.unit);

    return this.runSerializableTransaction(async (transaction) => {
      const metric = await transaction.healthMetric.create({
        data: {
          patientId,
          wearableDeviceId: null,
          metricType: dto.metricType,
          value: dto.value,
          secondaryValue: dto.secondaryValue ?? null,
          unit: dto.unit,
          measuredAt: new Date(dto.measuredAt),
          source: HealthMetricSource.MANUAL,
          externalRecordId: null,
          deduplicationKey: this.hashDeduplicationIdentity([
            'manual',
            randomUUID(),
          ]),
          ...(dto.metadata
            ? { metadata: dto.metadata as Prisma.InputJsonValue }
            : {}),
        },
      });

      await this.alertEvaluator.evaluateMetric(metric, transaction);
      await this.healthAudit.record(
        {
          userId,
          action: 'HEALTH_METRIC_CREATED',
          entity: 'HealthMetric',
          entityId: metric.id,
          metadata: {
            metricType: metric.metricType,
            source: metric.source,
          },
        },
        transaction,
      );

      return this.toResponse(metric);
    });
  }

  async syncForPatient(
    userId: string,
    dto: SyncHealthMetricsDto,
  ): Promise<HealthMetricSyncResult> {
    const patientId = await this.getPatientId(userId);

    for (const item of dto.measurements) {
      this.assertMetric(item.metricType, item.value, item.unit);
    }

    return this.runSerializableTransaction(async (transaction) => {
      const device = await transaction.wearableDevice.findFirst({
        where: {
          id: dto.wearableDeviceId,
          patientId,
          active: true,
        },
      });

      if (!device) {
        throw new NotFoundException('Active wearable device not found');
      }

      const source = PROVIDER_SOURCES[device.provider];
      const candidates = dto.measurements.map((item) => {
        const id = randomUUID();
        const measuredAt = new Date(item.measuredAt);
        const deduplicationKey = this.hashDeduplicationIdentity(
          item.externalRecordId
            ? [
                device.id,
                source,
                'external-record',
                item.metricType,
                item.externalRecordId,
              ]
            : [
                device.id,
                source,
                item.metricType,
                measuredAt.toISOString(),
                item.value,
                item.secondaryValue ?? null,
                item.unit,
              ],
        );
        const data: Prisma.HealthMetricCreateManyInput = {
          id,
          patientId,
          wearableDeviceId: device.id,
          metricType: item.metricType,
          value: item.value,
          secondaryValue: item.secondaryValue ?? null,
          unit: item.unit,
          measuredAt,
          source,
          externalRecordId: item.externalRecordId ?? null,
          deduplicationKey,
        };

        if (source === HealthMetricSource.MOCK) {
          data.metadata = {
            ...(item.metadata ?? {}),
            demo: true,
            disclaimer: MOCK_HEALTH_DATA_DISCLAIMER,
          } as Prisma.InputJsonValue;
        } else if (item.metadata) {
          data.metadata = item.metadata as Prisma.InputJsonValue;
        }

        return data;
      });

      await transaction.healthMetric.createMany({
        data: candidates,
        skipDuplicates: true,
      });

      const createdMetrics = await transaction.healthMetric.findMany({
        where: {
          patientId,
          id: { in: candidates.map(({ id }) => id as string) },
        },
        orderBy: [{ measuredAt: 'asc' }, { createdAt: 'asc' }],
      });

      for (const metric of createdMetrics) {
        await this.alertEvaluator.evaluateMetric(metric, transaction);
      }

      const lastSyncAt = new Date();
      const update = await transaction.wearableDevice.updateMany({
        where: { id: device.id, patientId, active: true },
        data: { lastSyncAt },
      });

      if (update.count !== 1) {
        throw new NotFoundException('Active wearable device not found');
      }

      await this.healthAudit.record(
        {
          userId,
          action: 'HEALTH_METRICS_SYNCED',
          entity: 'WearableDevice',
          entityId: device.id,
          metadata: {
            provider: device.provider,
            receivedCount: candidates.length,
            createdCount: createdMetrics.length,
            duplicateCount: candidates.length - createdMetrics.length,
          },
        },
        transaction,
      );

      return {
        receivedCount: candidates.length,
        createdCount: createdMetrics.length,
        duplicateCount: candidates.length - createdMetrics.length,
        lastSyncAt,
        metrics: createdMetrics.map((metric) => this.toResponse(metric)),
      };
    });
  }

  async syncDemoForPatient(
    userId: string,
    wearableDeviceId: string,
  ): Promise<HealthMetricSyncResult> {
    const device = await this.wearablesService.requireOwnedDeviceForUser(
      userId,
      wearableDeviceId,
      { activeOnly: true },
    );

    if (device.provider !== WearableProvider.MOCK) {
      throw new BadRequestException(
        'Demo synchronization is only available for the mock wearable',
      );
    }

    const provider = this.providerRegistry.get(device.provider);
    const generated = provider?.generateDemoMeasurements?.(device);

    if (!provider?.isDemo || !generated) {
      throw new BadRequestException('Demo wearable provider is unavailable');
    }

    return this.syncForPatient(userId, {
      wearableDeviceId,
      measurements: generated.map((measurement) => ({
        metricType: measurement.metricType,
        value: measurement.value,
        secondaryValue: measurement.secondaryValue,
        unit: measurement.unit,
        measuredAt: measurement.measuredAt.toISOString(),
        externalRecordId: measurement.externalRecordId,
        metadata: measurement.metadata,
      })),
    });
  }

  private buildWhere(
    patientId: string,
    query: HealthMetricsQueryDto,
  ): Prisma.HealthMetricWhereInput {
    this.assertDateRange(query);

    return {
      patientId,
      ...(query.metricType ? { metricType: query.metricType } : {}),
      ...(query.from || query.to
        ? {
            measuredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  private assertDateRange(query: HealthMetricsQueryDto): void {
    if (!query.from || !query.to) {
      return;
    }

    const from = Date.parse(query.from);
    const to = Date.parse(query.to);

    if (from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    if (to - from > MAX_HISTORY_RANGE_MS) {
      throw new BadRequestException(
        'Health history range cannot exceed 366 days',
      );
    }
  }

  private assertMetric(
    metricType: HealthMetricType,
    value: number,
    unit: string,
  ): void {
    const definition = HEALTH_METRIC_DEFINITIONS[metricType];

    if (unit !== definition.unit) {
      throw new BadRequestException(
        `unit must be "${definition.unit}" for ${metricType}`,
      );
    }

    if (value < definition.minimum || value > definition.maximum) {
      throw new BadRequestException(
        `value must be between ${definition.minimum} and ${definition.maximum} for ${metricType}`,
      );
    }
  }

  private hashDeduplicationIdentity(parts: unknown[]): string {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  }

  private toResponse(metric: HealthMetric): HealthMetricResponse {
    return {
      id: metric.id,
      wearableDeviceId: metric.wearableDeviceId,
      metricType: metric.metricType,
      value: metric.value,
      secondaryValue: metric.secondaryValue,
      unit: metric.unit,
      measuredAt: metric.measuredAt,
      source: metric.source,
      externalRecordId: metric.externalRecordId,
      metadata: metric.metadata,
      createdAt: metric.createdAt,
    };
  }

  private async getPatientId(userId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    return patient.id;
  }

  private async runSerializableTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const canRetry =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS;

        if (!canRetry) {
          throw error;
        }
      }
    }

    throw new Error('Serializable health metric transaction retry exhausted');
  }
}
