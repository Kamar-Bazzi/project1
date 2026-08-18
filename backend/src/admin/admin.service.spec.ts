import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService account and assignment safety', () => {
  it('prevents an administrator from disabling their own account', async () => {
    const service = new AdminService({} as PrismaService);

    await expect(service.disableUser('admin-id', 'admin-id')).rejects.toEqual(
      new ForbiddenException('Administrators cannot disable their own account'),
    );
  });

  it('rejects assignment when the doctor is not an active doctor', async () => {
    const upsert = jest.fn();
    const transaction = {
      doctor: { findFirst: jest.fn().mockResolvedValue(null) },
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient-id' }) },
      doctorPatientAccess: { upsert },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    } as unknown as PrismaService;
    const service = new AdminService(prisma);

    await expect(
      service.createAssignment('admin-id', {
        doctorId: 'doctor-id',
        patientId: 'patient-id',
      }),
    ).rejects.toEqual(new NotFoundException('Active doctor not found'));
    expect(upsert).not.toHaveBeenCalled();
  });
});
