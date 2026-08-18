import { ConfigService } from '@nestjs/config';
import {
  MedicationLogStatus,
  MedicationStatus,
  NotificationType,
} from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MedicationReminderService } from './medication-reminder.service';
import { MedicationsService } from './medications.service';

describe('MedicationReminderService', () => {
  interface AuditArguments {
    data: {
      action: string;
      entity: string;
      entityId: string;
      metadata: {
        patientId: string;
        status: MedicationLogStatus;
        operation: string;
      };
    };
  }
  interface ReminderQueryArguments {
    where: {
      status: MedicationLogStatus;
      scheduledFor: { gt?: Date; lte: Date };
      medication: { status: MedicationStatus };
    };
    select:
      | { id: boolean }
      | {
          id: boolean;
          medication: { select: { patientId: boolean } };
        };
    orderBy: { scheduledFor: string };
    take: number;
  }

  const prepareReminderLogs = jest.fn();
  const findMany = jest.fn<
    Promise<Array<{ id: string; medication?: { patientId: string } }>>,
    [ReminderQueryArguments]
  >();
  const notifyMedicationDose = jest.fn();
  const updateMany = jest.fn();
  const createAudit = jest.fn<Promise<{ id: string }>, [AuditArguments]>();
  const configGet = jest.fn();
  const service = new MedicationReminderService(
    {
      medicationLog: { findMany, updateMany },
      auditLog: { create: createAudit },
    } as unknown as PrismaService,
    { prepareReminderLogs } as unknown as MedicationsService,
    { notifyMedicationDose } as unknown as NotificationsService,
    { get: configGet } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prepareReminderLogs.mockResolvedValue(undefined);
    notifyMedicationDose.mockResolvedValue({ id: 'notification-1' });
    updateMany.mockResolvedValue({ count: 1 });
    createAudit.mockResolvedValue({ id: 'audit-1' });
    configGet.mockReturnValue(undefined);
  });

  it('materializes logs and dispatches due and overdue notifications', async () => {
    findMany
      .mockResolvedValueOnce([{ id: 'due-log' }])
      .mockResolvedValueOnce([
        { id: 'overdue-log', medication: { patientId: 'patient-1' } },
      ]);
    const now = new Date('2026-08-14T12:00:00.000Z');

    await expect(service.processDueNotifications(now)).resolves.toEqual({
      remindersProcessed: 1,
      overdueProcessed: 1,
    });

    expect(prepareReminderLogs).toHaveBeenCalledWith(now);
    const dueQuery = findMany.mock.calls[0][0];
    expect(dueQuery.where).toEqual({
      status: MedicationLogStatus.PENDING,
      scheduledFor: {
        gt: new Date('2026-08-14T11:30:00.000Z'),
        lte: new Date('2026-08-14T12:15:00.000Z'),
      },
      medication: { status: MedicationStatus.ACTIVE },
    });
    expect(notifyMedicationDose).toHaveBeenNthCalledWith(
      1,
      'due-log',
      NotificationType.MEDICATION_REMINDER,
    );
    expect(notifyMedicationDose).toHaveBeenNthCalledWith(
      2,
      'overdue-log',
      NotificationType.MEDICATION_OVERDUE,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'overdue-log',
        status: MedicationLogStatus.PENDING,
      },
      data: { status: MedicationLogStatus.MISSED },
    });
    const auditArguments = createAudit.mock.calls[0][0];
    expect(auditArguments.data.action).toBe('MEDICATION_DOSE_MARKED_MISSED');
    expect(auditArguments.data.entityId).toBe('overdue-log');
    expect(auditArguments.data.metadata.patientId).toBe('patient-1');
  });

  it('clamps unsafe environment values before building database windows', async () => {
    configGet.mockImplementation((key: string) => {
      if (key === 'MEDICATION_REMINDER_LEAD_MINUTES') return '99999';
      if (key === 'MEDICATION_OVERDUE_GRACE_MINUTES') return '-5';
      if (key === 'NOTIFICATION_DISPATCH_BATCH_SIZE') return '99999';
      return undefined;
    });
    findMany.mockResolvedValue([]);
    const now = new Date('2026-08-14T12:00:00.000Z');

    await service.processDueNotifications(now);

    const clampedQuery = findMany.mock.calls[0][0];
    expect(clampedQuery.where.scheduledFor).toEqual({
      gt: new Date('2026-08-14T11:59:00.000Z'),
      lte: new Date('2026-08-14T16:00:00.000Z'),
    });
    expect(clampedQuery.take).toBe(1000);
  });
});
