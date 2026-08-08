import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  HealthAlert,
  HealthAlertSeverity,
  HealthAlertStatus,
  HealthMetricType,
} from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthAlertsService } from './health-alerts.service';

describe('HealthAlertsService', () => {
  const patientFindUnique = jest.fn();
  const alertFindMany = jest.fn();
  const alertFindFirst = jest.fn();
  const alertUpdate = jest.fn();
  const auditRecord = jest.fn();
  const transaction = {
    healthAlert: { findFirst: alertFindFirst, update: alertUpdate },
  };
  const runTransaction = jest.fn(
    (callback: (client: typeof transaction) => unknown) =>
      Promise.resolve(callback(transaction)),
  );
  const prisma = {
    patient: { findUnique: patientFindUnique },
    healthAlert: { findMany: alertFindMany, findFirst: alertFindFirst },
    $transaction: runTransaction,
  };
  const audit = { record: auditRecord };
  const service = new HealthAlertsService(
    prisma as unknown as PrismaService,
    audit as unknown as HealthAuditService,
  );
  const now = new Date('2026-08-08T12:00:00.000Z');
  const alert: HealthAlert = {
    id: 'alert-1',
    patientId: 'patient-1',
    metricType: HealthMetricType.BLOOD_OXYGEN,
    severity: HealthAlertSeverity.WARNING,
    message: 'Outside configured range',
    metricId: 'metric-1',
    alertRuleId: 'rule-1',
    status: HealthAlertStatus.ACTIVE,
    detectedAt: now,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    patientFindUnique.mockResolvedValue({ id: 'patient-1' });
    auditRecord.mockResolvedValue(undefined);
  });

  it('lists only alerts belonging to the authenticated patient', async () => {
    alertFindMany.mockResolvedValue([alert]);

    await expect(
      service.findAllForPatient('user-1', {
        status: HealthAlertStatus.ACTIVE,
        metricType: HealthMetricType.BLOOD_OXYGEN,
        limit: 10,
      }),
    ).resolves.toEqual([alert]);
    expect(alertFindMany).toHaveBeenCalledWith({
      where: {
        patientId: 'patient-1',
        status: HealthAlertStatus.ACTIVE,
        metricType: HealthMetricType.BLOOD_OXYGEN,
      },
      orderBy: [{ detectedAt: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
  });

  it('does not reveal Patient B alert to Patient A', async () => {
    alertFindFirst.mockResolvedValue(null);

    await expect(
      service.findOneForPatient('patient-a-user', 'patient-b-alert'),
    ).rejects.toEqual(new NotFoundException('Health alert not found'));
    expect(alertFindFirst).toHaveBeenCalledWith({
      where: { id: 'patient-b-alert', patientId: 'patient-1' },
    });
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it('acknowledges an owned active alert atomically', async () => {
    alertFindFirst.mockResolvedValue(alert);
    alertUpdate.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...alert, ...data }),
    );

    const result = await service.acknowledgeForPatient('user-1', alert.id);

    expect(result.status).toBe(HealthAlertStatus.ACKNOWLEDGED);
    expect(result.acknowledgedAt).toBeInstanceOf(Date);
    expect(alertUpdate).toHaveBeenCalledWith({
      where: { id: alert.id, patientId: 'patient-1' },
      data: {
        status: HealthAlertStatus.ACKNOWLEDGED,
        acknowledgedAt: result.acknowledgedAt,
        resolvedAt: null,
      },
    });
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'HEALTH_ALERT_ACKNOWLEDGED' }),
      transaction,
    );
  });

  it('rejects acknowledging an already resolved alert', async () => {
    alertFindFirst.mockResolvedValue({
      ...alert,
      status: HealthAlertStatus.RESOLVED,
      resolvedAt: now,
    });

    await expect(
      service.acknowledgeForPatient('user-1', alert.id),
    ).rejects.toEqual(
      new BadRequestException('A resolved health alert cannot be acknowledged'),
    );
    expect(alertUpdate).not.toHaveBeenCalled();
  });

  it('cannot change the state of another patient alert', async () => {
    alertFindFirst.mockResolvedValue(null);

    await expect(
      service.resolveForPatient('patient-a-user', 'patient-b-alert'),
    ).rejects.toEqual(new NotFoundException('Health alert not found'));
    expect(alertUpdate).not.toHaveBeenCalled();
  });
});
