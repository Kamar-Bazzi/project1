import { ConflictException } from '@nestjs/common';
import { EmergencyEventStatus } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmergencyEventsService } from './emergency-events.service';

describe('EmergencyEventsService', () => {
  const patient = {
    id: 'patient-id',
    userId: 'patient-user',
    timeZone: 'UTC',
    user: { id: 'patient-user', name: 'Patient', email: 'p@example.com' },
  };

  it('commits the patient-owned event before enqueueing urgent notifications', async () => {
    const created = {
      id: 'event-id',
      patientId: patient.id,
      status: EmergencyEventStatus.ACTIVE,
      note: null,
      latitude: null,
      longitude: null,
      triggeredAt: new Date(),
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const create = jest.fn().mockResolvedValue(created);
    const transaction = {
      emergencyEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    const enqueueEmergencyMode = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
      emergencyContact: { findMany: jest.fn().mockResolvedValue([]) },
      measurement: { findMany: jest.fn().mockResolvedValue([]) },
      healthMetric: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new EmergencyEventsService(
      prisma,
      {
        getPatientForUser: jest.fn().mockResolvedValue(patient),
      } as unknown as ClinicalAccessService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as HealthAuditService,
      { enqueueEmergencyMode } as unknown as NotificationsService,
    );

    const result = await service.activate('patient-user', {});

    expect(result.event).toBe(created);
    expect(result.notificationQueued).toBe(true);
    expect(enqueueEmergencyMode).toHaveBeenCalledWith(created.id, patient.id);
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueEmergencyMode.mock.invocationCallOrder[0],
    );
  });

  it('does not enqueue a second event while emergency mode is active', async () => {
    const enqueueEmergencyMode = jest.fn();
    const transaction = {
      emergencyEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'active-event' }),
        create: jest.fn(),
      },
    };
    const service = new EmergencyEventsService(
      {
        $transaction: jest.fn(
          (operation: (client: typeof transaction) => Promise<unknown>) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      {
        getPatientForUser: jest.fn().mockResolvedValue(patient),
      } as unknown as ClinicalAccessService,
      {} as HealthAuditService,
      { enqueueEmergencyMode } as unknown as NotificationsService,
    );

    await expect(service.activate('patient-user', {})).rejects.toEqual(
      new ConflictException('Emergency mode is already active'),
    );
    expect(enqueueEmergencyMode).not.toHaveBeenCalled();
  });
});
