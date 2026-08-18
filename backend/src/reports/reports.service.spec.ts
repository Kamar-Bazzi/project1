import { NotFoundException } from '@nestjs/common';
import { MeasurementType } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const patient = {
    id: 'patient-id',
    userId: 'patient-user',
    timeZone: 'UTC',
    user: { id: 'patient-user', name: 'Patient', email: 'p@example.com' },
  };

  it('blocks unassigned doctor monitoring before querying clinical data', async () => {
    const measurementFindMany = jest.fn();
    const service = new ReportsService(
      {
        measurement: { findMany: measurementFindMany },
      } as unknown as PrismaService,
      {
        requireAssignedPatient: jest
          .fn()
          .mockRejectedValue(
            new NotFoundException('Assigned patient not found'),
          ),
      } as unknown as ClinicalAccessService,
      {} as HealthAuditService,
    );

    await expect(
      service.getDoctorPatientReport('doctor-user', patient.id, 30),
    ).rejects.toEqual(new NotFoundException('Assigned patient not found'));
    expect(measurementFindMany).not.toHaveBeenCalled();
  });

  it('flags a large recorded-data change with non-diagnostic wording', async () => {
    const now = new Date();
    const previous = new Date(now.getTime() - 40 * 86_400_000);
    const current = new Date(now.getTime() - 2 * 86_400_000);
    const prisma = {
      measurement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'old',
            patientId: patient.id,
            type: MeasurementType.HEART_RATE,
            value: 60,
            secondaryValue: null,
            unit: 'bpm',
            measuredAt: previous,
          },
          {
            id: 'new',
            patientId: patient.id,
            type: MeasurementType.HEART_RATE,
            value: 100,
            secondaryValue: null,
            unit: 'bpm',
            measuredAt: current,
          },
        ]),
      },
      healthMetric: { findMany: jest.fn().mockResolvedValue([]) },
      medicationLog: { findMany: jest.fn().mockResolvedValue([]) },
      healthAlert: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      healthGoal: { findMany: jest.fn().mockResolvedValue([]) },
      emergencyEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ReportsService(
      prisma,
      {
        getPatientForUser: jest.fn().mockResolvedValue(patient),
      } as unknown as ClinicalAccessService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as HealthAuditService,
    );

    const report = await service.getPatientReport('patient-user', 30);

    expect(report.measurements[0].unusualChange).toBe(true);
    expect(report.unusualChanges[0].description).toContain('not a diagnosis');
    expect(report.disclaimer).toContain('not diagnoses');
  });
});
