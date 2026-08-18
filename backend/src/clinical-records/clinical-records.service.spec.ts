import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalRecordsService } from './clinical-records.service';

describe('ClinicalRecordsService', () => {
  it('scopes note updates to the assigned doctor who authored the note', async () => {
    const noteFindFirst = jest.fn().mockResolvedValue(null);
    const transaction = {
      doctorNote: { findFirst: noteFindFirst },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    } as unknown as PrismaService;
    const access = {
      requireAssignedPatient: jest.fn().mockResolvedValue({
        doctor: { id: 'doctor-id' },
        patient: { id: 'patient-id' },
      }),
    } as unknown as ClinicalAccessService;
    const service = new ClinicalRecordsService(
      prisma,
      access,
      {} as HealthAuditService,
    );

    await expect(
      service.updateNote('doctor-user', 'patient-id', 'note-id', {
        title: 'Updated',
      }),
    ).rejects.toEqual(new NotFoundException('Doctor note not found'));
    expect(noteFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'note-id',
        patientId: 'patient-id',
        doctorId: 'doctor-id',
      },
      select: { id: true },
    });
  });

  it('rejects future follow-up records before any assignment or write', async () => {
    const requireAssignedPatient = jest.fn();
    const service = new ClinicalRecordsService(
      {} as PrismaService,
      { requireAssignedPatient } as unknown as ClinicalAccessService,
      {} as HealthAuditService,
    );

    await expect(
      service.createFollowUp('doctor-user', 'patient-id', {
        summary: 'Future record',
        occurredAt: '2099-01-01T00:00:00.000Z',
      }),
    ).rejects.toEqual(
      new BadRequestException('occurredAt cannot be in the future'),
    );
    expect(requireAssignedPatient).not.toHaveBeenCalled();
  });

  it('does not expose update or delete operations for immutable follow-ups', () => {
    const service = new ClinicalRecordsService(
      {} as PrismaService,
      {} as ClinicalAccessService,
      {} as HealthAuditService,
    );
    expect(service).not.toHaveProperty('updateFollowUp');
    expect(service).not.toHaveProperty('deleteFollowUp');
  });
});
