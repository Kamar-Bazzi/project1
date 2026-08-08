import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AlertRule,
  HealthAlertSeverity,
  HealthMetricType,
} from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AlertRulesService } from './alert-rules.service';

describe('AlertRulesService', () => {
  const patientFindUnique = jest.fn();
  const ruleFindFirst = jest.fn();
  const ruleFindMany = jest.fn();
  const ruleCreate = jest.fn();
  const ruleUpdate = jest.fn();
  const ruleDeleteMany = jest.fn();
  const auditRecord = jest.fn();
  const transaction = {
    alertRule: {
      findFirst: ruleFindFirst,
      create: ruleCreate,
      update: ruleUpdate,
      deleteMany: ruleDeleteMany,
    },
  };
  const runTransaction = jest.fn(
    (callback: (client: typeof transaction) => unknown) =>
      Promise.resolve(callback(transaction)),
  );
  const prisma = {
    patient: { findUnique: patientFindUnique },
    alertRule: { findFirst: ruleFindFirst, findMany: ruleFindMany },
    $transaction: runTransaction,
  };
  const service = new AlertRulesService(
    prisma as unknown as PrismaService,
    { record: auditRecord } as unknown as HealthAuditService,
  );
  const now = new Date('2026-08-08T12:00:00.000Z');
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

  beforeEach(() => {
    jest.clearAllMocks();
    patientFindUnique.mockResolvedValue({ id: 'patient-1' });
    auditRecord.mockResolvedValue(undefined);
  });

  it('creates a patient-owned rule without accepting patientId', async () => {
    ruleCreate.mockResolvedValue(rule);

    await service.createForPatient('user-1', {
      metricType: HealthMetricType.HEART_RATE,
      minimumValue: 50,
      maximumValue: 120,
      consecutiveReadingsRequired: 3,
    });

    expect(ruleCreate).toHaveBeenCalledWith({
      data: {
        patientId: 'patient-1',
        metricType: HealthMetricType.HEART_RATE,
        minimumValue: 50,
        maximumValue: 120,
        enabled: undefined,
        consecutiveReadingsRequired: 3,
        severity: undefined,
        notifyEmergencyContacts: undefined,
      },
    });
  });

  it('requires at least one configured threshold', async () => {
    await expect(
      service.createForPatient('user-1', {
        metricType: HealthMetricType.STEPS,
      }),
    ).rejects.toEqual(
      new BadRequestException(
        'At least one of minimumValue or maximumValue is required',
      ),
    );
    expect(ruleCreate).not.toHaveBeenCalled();
  });

  it('validates threshold order after merging an update', async () => {
    ruleFindFirst.mockResolvedValue(rule);

    await expect(
      service.updateForPatient('user-1', rule.id, { minimumValue: 130 }),
    ).rejects.toEqual(
      new BadRequestException('minimumValue must be less than maximumValue'),
    );
    expect(ruleUpdate).not.toHaveBeenCalled();
  });

  it('allows clearing one threshold when the other remains', async () => {
    ruleFindFirst.mockResolvedValue(rule);
    ruleUpdate.mockResolvedValue({ ...rule, minimumValue: null });

    await expect(
      service.updateForPatient('user-1', rule.id, { minimumValue: null }),
    ).resolves.toEqual({ ...rule, minimumValue: null });
    expect(ruleUpdate).toHaveBeenCalledWith({
      where: { id: rule.id, patientId: 'patient-1' },
      data: { minimumValue: null },
    });
  });

  it('does not reveal another patient rule', async () => {
    ruleFindFirst.mockResolvedValue(null);

    await expect(
      service.findOneForPatient('patient-a-user', 'patient-b-rule'),
    ).rejects.toEqual(new NotFoundException('Alert rule not found'));
    expect(ruleFindFirst).toHaveBeenCalledWith({
      where: { id: 'patient-b-rule', patientId: 'patient-1' },
    });
  });
});
