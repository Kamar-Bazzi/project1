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

  it('paginates and combines audit-log filters', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'audit-1' }]);
    const count = jest.fn().mockResolvedValue(26);
    const prisma = {
      auditLog: { findMany, count },
      $transaction: jest.fn((queries: Array<Promise<unknown>>) =>
        Promise.all(queries),
      ),
    } as unknown as PrismaService;
    const service = new AdminService(prisma);

    await expect(
      service.findAuditLogs({
        page: 2,
        pageSize: 25,
        action: 'LOGIN',
        entity: 'User',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-11T23:59:59.999Z',
      }),
    ).resolves.toEqual({
      items: [{ id: 'audit-1' }],
      pagination: { page: 2, pageSize: 25, total: 26, totalPages: 2 },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: undefined,
        action: { contains: 'LOGIN', mode: 'insensitive' },
        entity: { contains: 'User', mode: 'insensitive' },
        createdAt: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lte: new Date('2026-09-11T23:59:59.999Z'),
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 25,
      take: 25,
    });
  });
});
