import { NotFoundException } from '@nestjs/common';
import { MeasurementType } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MedicalHistoryEventType } from './dto/medical-history-query.dto';
import { MedicalHistoryService } from './medical-history.service';

describe('MedicalHistoryService authorization', () => {
  it('does not query timeline records when a doctor is unassigned', async () => {
    const transaction = jest.fn();
    const access = {
      requireAssignedPatient: jest
        .fn()
        .mockRejectedValue(new NotFoundException('Assigned patient not found')),
    } as unknown as ClinicalAccessService;
    const service = new MedicalHistoryService(
      { $transaction: transaction } as unknown as PrismaService,
      access,
      {} as HealthAuditService,
    );

    await expect(
      service.findForDoctor('doctor-user', 'patient-id', {
        page: 1,
        pageSize: 20,
        period: 30,
      }),
    ).rejects.toEqual(new NotFoundException('Assigned patient not found'));
    expect(transaction).not.toHaveBeenCalled();
  });

  it('filters, merges, and slices a patient timeline page', async () => {
    const emptyDelegate = () => ({
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    });
    const medication = emptyDelegate();
    const medicationLog = emptyDelegate();
    const healthMetric = emptyDelegate();
    const healthAlert = emptyDelegate();
    const appointment = emptyDelegate();
    const doctorNote = emptyDelegate();
    const patientFollowUp = emptyDelegate();
    const measurement = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'measurement-2',
          type: MeasurementType.WEIGHT,
          value: 72,
          secondaryValue: null,
          unit: 'kg',
          measuredAt: new Date('2026-09-14T10:00:00.000Z'),
        },
        {
          id: 'measurement-1',
          type: MeasurementType.WEIGHT,
          value: 71,
          secondaryValue: null,
          unit: 'kg',
          measuredAt: new Date('2026-09-13T10:00:00.000Z'),
        },
      ]),
      count: jest.fn().mockResolvedValue(3),
    };
    const prisma = {
      medication,
      medicationLog,
      measurement,
      healthMetric,
      healthAlert,
      appointment,
      doctorNote,
      patientFollowUp,
      $transaction: jest.fn((queries: Array<Promise<unknown>>) =>
        Promise.all(queries),
      ),
    } as unknown as PrismaService;
    const access = {
      getPatientForUser: jest.fn().mockResolvedValue({
        id: 'patient-1',
        user: {
          id: 'user-1',
          name: 'Patient One',
          email: 'patient@example.test',
        },
      }),
    } as unknown as ClinicalAccessService;
    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as HealthAuditService;
    const service = new MedicalHistoryService(prisma, access, audit);

    const result = await service.findForPatient('user-1', {
      page: 2,
      pageSize: 1,
      period: 30,
      types: [MedicalHistoryEventType.MEASUREMENT],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'measurement-1',
        type: MedicalHistoryEventType.MEASUREMENT,
        summary: '71 kg',
      }),
    ]);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 3,
      totalPages: 3,
    });
    type MeasurementFindManyArgs = {
      where?: { patientId?: string };
      orderBy?: Array<Record<string, string>>;
      take?: number;
    };
    const measurementFindManyCalls = measurement.findMany.mock
      .calls as unknown as Array<[MeasurementFindManyArgs]>;
    const measurementFindManyCall = measurementFindManyCalls[0]?.[0];
    expect(measurementFindManyCall?.where?.patientId).toBe('patient-1');
    expect(measurementFindManyCall?.orderBy).toEqual([
      { measuredAt: 'desc' },
      { id: 'asc' },
    ]);
    expect(measurementFindManyCall?.take).toBe(2);

    const medicationFindManyCalls = medication.findMany.mock
      .calls as unknown as Array<[{ where?: { patientId?: string } }]>;
    const medicationFindManyCall = medicationFindManyCalls[0]?.[0];
    expect(medicationFindManyCall?.where?.patientId).toBe('__excluded__');
  });
});
