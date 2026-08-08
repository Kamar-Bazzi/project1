import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  HealthMetric,
  HealthMetricSource,
  HealthMetricType,
  Prisma,
  WearableProvider,
} from '@prisma/client';

import {
  HealthAuditEvent,
  HealthAuditService,
} from '../common/health-audit/health-audit.service';
import { HealthAlertEvaluatorService } from '../health-alerts/health-alert-evaluator.service';
import { PrismaService } from '../prisma/prisma.service';
import { WearableProviderRegistry } from '../wearables/providers/wearable-provider.registry';
import { WearablesService } from '../wearables/wearables.service';
import { HealthMetricsService } from './health-metrics.service';

describe('HealthMetricsService', () => {
  const patientFindUnique = jest.fn();
  const metricFindMany = jest.fn();
  const metricFindFirst = jest.fn();
  const metricCreate = jest.fn();
  const metricCreateMany = jest.fn();
  const deviceFindFirst = jest.fn();
  const deviceUpdateMany = jest.fn();
  const evaluateMetric = jest.fn();
  const auditRecord = jest.fn();

  const transaction = {
    healthMetric: {
      create: metricCreate,
      createMany: metricCreateMany,
      findMany: metricFindMany,
    },
    wearableDevice: {
      findFirst: deviceFindFirst,
      updateMany: deviceUpdateMany,
    },
  };
  const executeTransaction = (
    callback: (client: typeof transaction) => unknown,
  ) => Promise.resolve(callback(transaction));
  const prisma = {
    patient: { findUnique: patientFindUnique },
    healthMetric: { findMany: metricFindMany, findFirst: metricFindFirst },
    $transaction: jest.fn(executeTransaction),
  };
  const evaluator = { evaluateMetric };
  const audit = { record: auditRecord };
  const requireOwnedDeviceForUser = jest.fn();
  const generateDemoMeasurements = jest.fn();
  const wearables = { requireOwnedDeviceForUser };
  const providerRegistry = {
    get: jest.fn(() => ({
      isDemo: true,
      generateDemoMeasurements,
    })),
  };
  let service: HealthMetricsService;

  const metric: HealthMetric = {
    id: '11aa22bb-33cc-44dd-88ee-112233445566',
    patientId: 'patient-1',
    wearableDeviceId: '22aa22bb-33cc-44dd-88ee-112233445566',
    metricType: HealthMetricType.HEART_RATE,
    value: 78,
    secondaryValue: null,
    unit: 'bpm',
    measuredAt: new Date('2026-08-08T10:00:00.000Z'),
    source: HealthMetricSource.MOCK,
    externalRecordId: 'mock-heart-rate-1',
    deduplicationKey: 'a'.repeat(64),
    metadata: { demo: true },
    createdAt: new Date('2026-08-08T10:00:01.000Z'),
  };
  const device = {
    id: metric.wearableDeviceId as string,
    patientId: 'patient-1',
    provider: WearableProvider.MOCK,
    deviceName: 'Demo Watch',
    externalDeviceId: 'demo-watch',
    connectedAt: new Date('2026-08-08T09:00:00.000Z'),
    lastSyncAt: null,
    active: true,
    createdAt: new Date('2026-08-08T09:00:00.000Z'),
    updatedAt: new Date('2026-08-08T09:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    patientFindUnique.mockResolvedValue({ id: 'patient-1' });
    prisma.$transaction.mockImplementation(executeTransaction);
    metricFindMany.mockResolvedValue([]);
    metricFindFirst.mockResolvedValue(null);
    metricCreateMany.mockResolvedValue({ count: 0 });
    deviceFindFirst.mockResolvedValue(device);
    deviceUpdateMany.mockResolvedValue({ count: 1 });
    evaluateMetric.mockResolvedValue(null);
    auditRecord.mockResolvedValue(undefined);
    requireOwnedDeviceForUser.mockResolvedValue(device);
    generateDemoMeasurements.mockReturnValue([]);
    service = new HealthMetricsService(
      prisma as unknown as PrismaService,
      evaluator as unknown as HealthAlertEvaluatorService,
      audit as unknown as HealthAuditService,
      wearables as unknown as WearablesService,
      providerRegistry as unknown as WearableProviderRegistry,
    );
  });

  it('scopes metric reads to the authenticated patient', async () => {
    metricFindMany.mockResolvedValue([metric]);

    await expect(service.findAllForPatient('user-1', {})).resolves.toEqual([
      metric,
    ]);
    expect(metricFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: 'patient-1' } }),
    );
  });

  it('cannot return Patient B data because every history query includes Patient A ownership', async () => {
    metricFindMany.mockResolvedValue([]);

    await service.findHistoryForPatient('user-a', {
      metricType: HealthMetricType.HEART_RATE,
    });

    expect(metricFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patientId: 'patient-1',
          metricType: HealthMetricType.HEART_RATE,
        },
      }),
    );
  });

  it('fetches one indexed latest row per metric type without loading full history', async () => {
    metricFindFirst.mockImplementation(
      ({ where }: Prisma.HealthMetricFindFirstArgs) =>
        Promise.resolve(
          where.metricType === HealthMetricType.HEART_RATE ? metric : null,
        ),
    );

    await expect(service.findLatestForPatient('user-1', {})).resolves.toEqual([
      metric,
    ]);
    expect(metricFindFirst).toHaveBeenCalledTimes(
      Object.values(HealthMetricType).length,
    );
    expect(metricFindMany).not.toHaveBeenCalled();

    const latestCalls = metricFindFirst.mock.calls as unknown as Array<
      [Prisma.HealthMetricFindFirstArgs]
    >;
    expect(latestCalls[0][0].where).toEqual(
      expect.objectContaining({ patientId: 'patient-1' }),
    );
    expect(latestCalls[0][0].orderBy).toEqual([
      { measuredAt: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it('loads the newest bounded history window and returns it chronologically', async () => {
    const newerMetric = {
      ...metric,
      id: 'newer-metric',
      measuredAt: new Date('2026-08-08T11:00:00.000Z'),
    };
    metricFindMany.mockResolvedValue([newerMetric, metric]);

    await expect(
      service.findHistoryForPatient('user-1', { limit: 2 }),
    ).resolves.toEqual([metric, newerMetric]);

    const historyCalls = metricFindMany.mock.calls as unknown as Array<
      [Prisma.HealthMetricFindManyArgs]
    >;
    expect(historyCalls[0][0].orderBy).toEqual([
      { measuredAt: 'desc' },
      { createdAt: 'desc' },
    ]);
    expect(historyCalls[0][0].take).toBe(2);
  });

  it('rejects a non-canonical unit before saving', async () => {
    await expect(
      service.createForPatient('user-1', {
        metricType: HealthMetricType.HEART_RATE,
        value: 78,
        unit: 'Hz',
        measuredAt: '2026-08-08T10:00:00.000Z',
      }),
    ).rejects.toEqual(
      new BadRequestException('unit must be "bpm" for HEART_RATE'),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('saves a batch, evaluates only newly inserted metrics, and updates sync time', async () => {
    metricFindMany.mockResolvedValue([metric]);
    metricCreateMany.mockResolvedValue({ count: 1 });

    const result = await service.syncForPatient('user-1', {
      wearableDeviceId: device.id,
      measurements: [
        {
          metricType: HealthMetricType.HEART_RATE,
          value: 78,
          unit: 'bpm',
          measuredAt: '2026-08-08T10:00:00.000Z',
          externalRecordId: 'mock-heart-rate-1',
          metadata: { demo: true },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        receivedCount: 1,
        createdCount: 1,
        duplicateCount: 0,
      }),
    );
    expect(result.metrics[0]).toEqual(
      expect.objectContaining({
        id: metric.id,
        metricType: metric.metricType,
        value: metric.value,
      }),
    );
    expect(result.metrics[0]).not.toHaveProperty('patientId');
    expect(result.metrics[0]).not.toHaveProperty('deduplicationKey');
    const createManyCalls = metricCreateMany.mock.calls as unknown as Array<
      [Prisma.HealthMetricCreateManyArgs]
    >;
    const createManyArguments = createManyCalls[0][0];
    const createdData =
      createManyArguments.data as Prisma.HealthMetricCreateManyInput[];
    expect(createManyArguments.skipDuplicates).toBe(true);
    expect(createdData).toHaveLength(1);
    expect(createdData[0]).toEqual(
      expect.objectContaining({
        patientId: 'patient-1',
        wearableDeviceId: device.id,
        source: HealthMetricSource.MOCK,
      }),
    );
    expect(createdData[0].deduplicationKey).toMatch(/^[a-f0-9]{64}$/);
    expect(evaluateMetric).toHaveBeenCalledWith(metric, transaction);
    const updateManyCalls = deviceUpdateMany.mock.calls as unknown as Array<
      [Prisma.WearableDeviceUpdateManyArgs]
    >;
    expect(updateManyCalls[0][0].where).toEqual({
      id: device.id,
      patientId: 'patient-1',
      active: true,
    });
    expect(updateManyCalls[0][0].data.lastSyncAt).toBeInstanceOf(Date);
  });

  it('reports duplicate sync rows and does not evaluate them again', async () => {
    metricFindMany.mockResolvedValue([]);
    metricCreateMany.mockResolvedValue({ count: 0 });

    const result = await service.syncForPatient('user-1', {
      wearableDeviceId: device.id,
      measurements: [
        {
          metricType: HealthMetricType.HEART_RATE,
          value: 78,
          unit: 'bpm',
          measuredAt: '2026-08-08T10:00:00.000Z',
          externalRecordId: 'same-provider-record',
        },
      ],
    });

    expect(result.createdCount).toBe(0);
    expect(result.duplicateCount).toBe(1);
    expect(evaluateMetric).not.toHaveBeenCalled();
  });

  it('namespaces provider record identifiers by metric type', async () => {
    await service.syncForPatient('user-1', {
      wearableDeviceId: device.id,
      measurements: [
        {
          metricType: HealthMetricType.HEART_RATE,
          value: 78,
          unit: 'bpm',
          measuredAt: '2026-08-08T10:00:00.000Z',
          externalRecordId: 'provider-shared-record',
        },
        {
          metricType: HealthMetricType.BLOOD_OXYGEN,
          value: 97,
          unit: '%',
          measuredAt: '2026-08-08T10:00:00.000Z',
          externalRecordId: 'provider-shared-record',
        },
      ],
    });

    const createCalls = metricCreateMany.mock.calls as unknown as Array<
      [Prisma.HealthMetricCreateManyArgs]
    >;
    const data = createCalls[0][0].data as Prisma.HealthMetricCreateManyInput[];
    expect(data[0].deduplicationKey).not.toBe(data[1].deduplicationKey);
  });

  it('routes generated demo measurements through the regular synchronization flow', async () => {
    generateDemoMeasurements.mockReturnValue([
      {
        metricType: HealthMetricType.HEART_RATE,
        value: 76,
        unit: 'bpm',
        measuredAt: new Date('2026-08-08T10:00:00.000Z'),
        source: HealthMetricSource.MOCK,
        externalRecordId: 'demo-heart-rate',
        metadata: {
          demo: true,
          disclaimer: 'Generated demo data; not a real medical reading.',
        },
      },
    ]);

    await service.syncDemoForPatient('user-1', device.id);

    expect(requireOwnedDeviceForUser).toHaveBeenCalledWith(
      'user-1',
      device.id,
      { activeOnly: true },
    );
    const demoCreateCalls = metricCreateMany.mock.calls as unknown as Array<
      [Prisma.HealthMetricCreateManyArgs]
    >;
    const demoData = demoCreateCalls[0][0]
      .data as Prisma.HealthMetricCreateManyInput[];
    expect(demoData[0]).toEqual(
      expect.objectContaining({
        source: HealthMetricSource.MOCK,
        externalRecordId: 'demo-heart-rate',
      }),
    );
    expect(demoData[0].metadata).toEqual(
      expect.objectContaining({ demo: true }),
    );
  });

  it('does not accept a wearable owned by another patient', async () => {
    deviceFindFirst.mockResolvedValue(null);

    await expect(
      service.syncForPatient('user-a', {
        wearableDeviceId: device.id,
        measurements: [
          {
            metricType: HealthMetricType.STEPS,
            value: 1_000,
            unit: 'count',
            measuredAt: '2026-08-08T10:00:00.000Z',
          },
        ],
      }),
    ).rejects.toEqual(
      new NotFoundException('Active wearable device not found'),
    );
    expect(deviceFindFirst).toHaveBeenCalledWith({
      where: {
        id: device.id,
        patientId: 'patient-1',
        active: true,
      },
    });
    expect(metricCreateMany).not.toHaveBeenCalled();
  });

  it('does not include metric values in the synchronization audit event', async () => {
    metricFindMany.mockResolvedValue([metric]);

    await service.syncForPatient('user-1', {
      wearableDeviceId: device.id,
      measurements: [
        {
          metricType: HealthMetricType.HEART_RATE,
          value: 78,
          unit: 'bpm',
          measuredAt: '2026-08-08T10:00:00.000Z',
        },
      ],
    });

    const auditCalls = auditRecord.mock.calls as unknown as Array<
      [HealthAuditEvent, Prisma.TransactionClient?]
    >;
    const event = auditCalls.at(-1)?.[0];
    expect(JSON.stringify(event)).not.toContain('78');
    expect(event).toEqual(
      expect.objectContaining({ action: 'HEALTH_METRICS_SYNCED' }),
    );
  });

  it('rejects inverted and excessively large history ranges', async () => {
    await expect(
      service.findHistoryForPatient('user-1', {
        from: '2026-08-08T10:00:00.000Z',
        to: '2026-08-07T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.findHistoryForPatient('user-1', {
        from: '2025-01-01T00:00:00.000Z',
        to: '2026-08-08T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retries a serializable synchronization conflict', async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );

    await service.syncForPatient('user-1', {
      wearableDeviceId: device.id,
      measurements: [
        {
          metricType: HealthMetricType.STEPS,
          value: 1_000,
          unit: 'count',
          measuredAt: '2026-08-08T10:00:00.000Z',
        },
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('returns 404 before any health query when the JWT has no patient profile', async () => {
    patientFindUnique.mockResolvedValue(null);

    await expect(service.findAllForPatient('user-1', {})).rejects.toEqual(
      new NotFoundException('Patient profile not found'),
    );
    expect(metricFindMany).not.toHaveBeenCalled();
  });
});
