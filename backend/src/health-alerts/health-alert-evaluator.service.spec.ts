import {
  AlertRule,
  HealthAlert,
  HealthAlertSeverity,
  HealthAlertStatus,
  HealthMetric,
  HealthMetricSource,
  HealthMetricType,
} from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthAlertEvaluatorService } from './health-alert-evaluator.service';

describe('HealthAlertEvaluatorService', () => {
  const ruleFindUnique = jest.fn();
  const metricFindFirst = jest.fn();
  const metricFindMany = jest.fn();
  const alertFindFirst = jest.fn();
  const alertCreate = jest.fn();
  const prisma = {
    alertRule: { findUnique: ruleFindUnique },
    healthMetric: { findFirst: metricFindFirst, findMany: metricFindMany },
    healthAlert: { findFirst: alertFindFirst, create: alertCreate },
  };
  const notifyHealthAlert = jest.fn();
  const notifications = { notifyHealthAlert };
  const recordAudit = jest.fn();
  const audit = { record: recordAudit };
  const service = new HealthAlertEvaluatorService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    audit as unknown as HealthAuditService,
  );
  const now = new Date('2026-08-08T12:00:00.000Z');
  const metric: HealthMetric = {
    id: 'metric-3',
    patientId: 'patient-1',
    wearableDeviceId: 'device-1',
    metricType: HealthMetricType.HEART_RATE,
    value: 140,
    secondaryValue: null,
    unit: 'bpm',
    measuredAt: now,
    source: HealthMetricSource.MOCK,
    externalRecordId: 'external-3',
    deduplicationKey: 'c'.repeat(64),
    metadata: { demo: true },
    createdAt: now,
  };
  const rule: AlertRule = {
    id: 'rule-1',
    patientId: 'patient-1',
    metricType: HealthMetricType.HEART_RATE,
    enabled: true,
    minimumValue: 50,
    maximumValue: 120,
    consecutiveReadingsRequired: 3,
    severity: HealthAlertSeverity.WARNING,
    notifyEmergencyContacts: false,
    createdAt: now,
    updatedAt: now,
  };
  const alert: HealthAlert = {
    id: 'alert-1',
    patientId: 'patient-1',
    metricType: HealthMetricType.HEART_RATE,
    severity: HealthAlertSeverity.WARNING,
    message:
      'Your heart rate readings are outside your configured range. Recheck the reading and seek appropriate attention if it remains unusual.',
    metricId: metric.id,
    alertRuleId: rule.id,
    status: HealthAlertStatus.ACTIVE,
    detectedAt: now,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  function historicalMetric(id: string, value: number, minute: number) {
    return {
      ...metric,
      id,
      value,
      measuredAt: new Date(`2026-08-08T11:${minute}:00.000Z`),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    ruleFindUnique.mockResolvedValue(rule);
    metricFindFirst.mockResolvedValue({ id: metric.id });
    metricFindMany.mockResolvedValue([
      historicalMetric('metric-2', 135, 59),
      historicalMetric('metric-1', 130, 58),
    ]);
    alertFindFirst.mockResolvedValue(null);
    alertCreate.mockResolvedValue(alert);
    notifyHealthAlert.mockResolvedValue([
      { channel: 'IN_APP', outcome: 'DELIVERED', recipientCount: 1 },
      {
        channel: 'EMERGENCY_CONTACT',
        outcome: 'NOT_REQUESTED',
        recipientCount: 0,
      },
    ]);
    recordAudit.mockResolvedValue(undefined);
  });

  it('does not trigger before consecutiveReadingsRequired is reached', async () => {
    metricFindMany.mockResolvedValue([historicalMetric('metric-2', 135, 59)]);

    await expect(service.evaluateMetric(metric)).resolves.toBeNull();
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('does not trigger a disabled rule', async () => {
    ruleFindUnique.mockResolvedValue({ ...rule, enabled: false });

    await expect(service.evaluateMetric(metric)).resolves.toBeNull();
    expect(metricFindMany).not.toHaveBeenCalled();
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('requires every consecutive reading to be outside the range', async () => {
    metricFindMany.mockResolvedValue([
      historicalMetric('metric-2', 90, 59),
      historicalMetric('metric-1', 130, 58),
    ]);

    await expect(service.evaluateMetric(metric)).resolves.toBeNull();
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('does not alert on delayed backfill when a newer reading already exists', async () => {
    metricFindFirst.mockResolvedValue({ id: 'newer-normal-reading' });

    await expect(service.evaluateMetric(metric)).resolves.toBeNull();
    expect(metricFindMany).not.toHaveBeenCalled();
    expect(alertCreate).not.toHaveBeenCalled();
    expect(metricFindFirst).toHaveBeenCalledWith({
      where: {
        patientId: metric.patientId,
        metricType: metric.metricType,
      },
      select: { id: true },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('creates a safe alert after the configured sequence and notifies in-app', async () => {
    await expect(service.evaluateMetric(metric)).resolves.toEqual(alert);

    expect(alertCreate).toHaveBeenCalledWith({
      data: {
        patientId: 'patient-1',
        metricType: HealthMetricType.HEART_RATE,
        severity: HealthAlertSeverity.WARNING,
        message:
          'Your heart rate readings are outside your configured range. Recheck the reading and seek appropriate attention if it remains unusual.',
        metricId: metric.id,
        alertRuleId: rule.id,
      },
    });
    const createCalls = alertCreate.mock.calls as unknown as Array<
      [{ data: { message: string } }]
    >;
    const createData = createCalls[0][0];
    expect(createData.data.message).not.toMatch(
      /heart attack|stroke|diagnos|emergency/i,
    );
    expect(notifyHealthAlert).toHaveBeenCalledWith(alert, rule, undefined);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HEALTH_ALERT_DETECTED',
        entityId: alert.id,
      }),
      undefined,
    );
  });

  it('does not create another alert while one is active or acknowledged', async () => {
    alertFindFirst.mockResolvedValue(alert);

    await expect(service.evaluateMetric(metric)).resolves.toBeNull();
    expect(alertCreate).not.toHaveBeenCalled();
  });

  it('processes a batch chronologically', async () => {
    const later = {
      ...metric,
      id: 'later',
      measuredAt: new Date(now.getTime() + 1),
    };
    const earlier = {
      ...metric,
      id: 'earlier',
      measuredAt: new Date(now.getTime() - 1),
    };
    const evaluation = jest
      .spyOn(service, 'evaluateMetric')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(alert);

    await expect(service.evaluateMetrics([later, earlier])).resolves.toEqual([
      alert,
    ]);
    expect(evaluation.mock.calls.map(([reading]) => reading.id)).toEqual([
      'earlier',
      'later',
    ]);
  });
});
