import { Prisma, UserRole } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalExportsService } from './clinical-exports.service';
import {
  ClinicalExportDataset,
  ReportExportFormat,
} from './dto/report-query.dto';
import { ReportsService } from './reports.service';

describe('ClinicalExportsService', () => {
  it('keeps a doctor CSV export scoped through the active assignment relation', async () => {
    const measurementFindMany = jest
      .fn<Promise<unknown[]>, [Prisma.MeasurementFindManyArgs]>()
      .mockResolvedValue([
        {
          id: 'measurement-id',
          type: 'HEART_RATE',
          value: 80,
          secondaryValue: null,
          unit: '=unsafe-formula',
          measuredAt: new Date('2026-08-01T12:00:00.000Z'),
        },
      ]);
    const patient = {
      id: 'patient-id',
      userId: 'patient-user',
      timeZone: 'UTC',
      user: { id: 'patient-user', name: 'Patient', email: 'p@example.com' },
    };
    const service = new ClinicalExportsService(
      {
        measurement: { findMany: measurementFindMany },
      } as unknown as PrismaService,
      {
        resolvePatientForActor: jest.fn().mockResolvedValue({
          patient,
          doctor: { id: 'doctor-id' },
        }),
      } as unknown as ClinicalAccessService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as HealthAuditService,
      {} as ReportsService,
    );

    const file = await service.exportDataset(
      { id: 'doctor-user', role: UserRole.DOCTOR },
      ClinicalExportDataset.MEASUREMENTS,
      {
        patientId: patient.id,
        format: ReportExportFormat.CSV,
      },
    );

    const arguments_ = measurementFindMany.mock.calls[0]?.[0] as {
      where: { patient: unknown };
    };
    expect(arguments_.where.patient).toEqual({
      id: patient.id,
      doctorAccessGrants: {
        some: {
          active: true,
          doctor: { userId: 'doctor-user' },
        },
      },
    });
    expect(file.contentType).toBe('text/csv; charset=utf-8');
    expect(file.content.toString('utf8')).toContain("'=unsafe-formula");
  });

  it('generates a structurally valid PDF header for an authorized export', async () => {
    const patient = {
      id: 'patient-id',
      userId: 'patient-user',
      timeZone: 'UTC',
      user: { id: 'patient-user', name: 'Patient', email: 'p@example.com' },
    };
    const service = new ClinicalExportsService(
      {
        appointment: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaService,
      {
        resolvePatientForActor: jest.fn().mockResolvedValue({
          patient,
          doctor: null,
        }),
      } as unknown as ClinicalAccessService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as HealthAuditService,
      {} as ReportsService,
    );

    const file = await service.exportDataset(
      { id: 'patient-user', role: UserRole.PATIENT },
      ClinicalExportDataset.APPOINTMENTS,
      { format: ReportExportFormat.PDF },
    );

    expect(file.contentType).toBe('application/pdf');
    expect(file.content.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');
    expect(file.content.toString('ascii')).toContain('%%EOF');
  });
});
