import { NotFoundException } from '@nestjs/common';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
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
});
