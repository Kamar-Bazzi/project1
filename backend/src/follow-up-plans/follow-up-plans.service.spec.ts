import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FollowUpTaskStatus } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { FollowUpPlansService } from './follow-up-plans.service';

describe('FollowUpPlansService', () => {
  function serviceWithTransaction(transaction: object) {
    const prisma = {
      $transaction: jest.fn((operation: (client: object) => Promise<unknown>) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const requireAssignedPatient = jest.fn().mockResolvedValue({
      doctor: { id: 'doctor-1' },
      patient: { id: 'patient-1' },
    });
    const getPatientForUser = jest
      .fn()
      .mockResolvedValue({ id: 'patient-1', userId: 'patient-user' });
    const access = {
      requireAssignedPatient,
      getPatientForUser,
    } as unknown as ClinicalAccessService;
    const auditRecord = jest.fn().mockResolvedValue(undefined);
    const audit = {
      record: auditRecord,
    } as unknown as HealthAuditService;
    return {
      service: new FollowUpPlansService(prisma, access, audit),
      requireAssignedPatient,
      getPatientForUser,
      auditRecord,
    };
  }

  it('scopes plan updates to the current assigned doctor author', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const transaction = { followUpPlan: { findFirst } };
    const { service, requireAssignedPatient } =
      serviceWithTransaction(transaction);

    await expect(
      service.updatePlan('doctor-user', 'patient-1', 'plan-1', {
        title: 'Updated plan',
      }),
    ).rejects.toEqual(new NotFoundException('Follow-up plan not found'));

    expect(requireAssignedPatient).toHaveBeenCalledWith(
      'doctor-user',
      'patient-1',
      transaction,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'plan-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
      },
      select: { id: true },
    });
  });
  it('checks task, plan, patient and doctor ownership in one predicate', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const transaction = { followUpTask: { findFirst } };
    const { service } = serviceWithTransaction(transaction);

    await expect(
      service.updateTask('doctor-user', 'patient-1', 'plan-1', 'task-1', {
        status: FollowUpTaskStatus.DONE,
      }),
    ).rejects.toEqual(new NotFoundException('Follow-up task not found'));

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        followUpPlanId: 'plan-1',
        followUpPlan: { patientId: 'patient-1', doctorId: 'doctor-1' },
      },
      select: { id: true, status: true, completedAt: true },
    });
  });

  it('sets completedAt when a task is marked done and audits the write', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
    interface TaskUpdateArguments {
      where: { id: string };
      data: {
        status?: FollowUpTaskStatus;
        completedAt?: Date | null;
      };
    }
    const update = jest.fn<
      Promise<{
        id: string;
        status: FollowUpTaskStatus;
        completedAt: Date | null;
      }>,
      [TaskUpdateArguments]
    >(({ data }) =>
      Promise.resolve({
        id: 'task-1',
        status: data.status ?? FollowUpTaskStatus.TODO,
        completedAt: data.completedAt ?? null,
      }),
    );
    const transaction = {
      followUpTask: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'task-1',
          status: FollowUpTaskStatus.TODO,
          completedAt: null,
        }),
        update,
      },
    };
    const { service, auditRecord } = serviceWithTransaction(transaction);

    await service.updateTask('doctor-user', 'patient-1', 'plan-1', 'task-1', {
      status: FollowUpTaskStatus.DONE,
    });

    const updateArguments = update.mock.calls[0]?.[0];
    expect(updateArguments?.where).toEqual({ id: 'task-1' });
    expect(updateArguments?.data.status).toBe(FollowUpTaskStatus.DONE);
    expect(updateArguments?.data.completedAt).toEqual(
      new Date('2026-08-22T12:00:00.000Z'),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FOLLOW_UP_TASK_UPDATED',
        entityId: 'task-1',
      }),
      transaction,
    );
    jest.useRealTimers();
  });

  it('derives patient plan reads from the authenticated patient profile', async () => {
    const transaction = {
      followUpPlan: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const { service, getPatientForUser } = serviceWithTransaction(transaction);

    const result = await service.findForPatient('patient-user', 1, 20);

    expect(getPatientForUser).toHaveBeenCalledWith('patient-user', transaction);
    expect(transaction.followUpPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: 'patient-1' } }),
    );
    expect(result.pagination.total).toBe(0);
  });

  it('limits doctor plan reads to plans authored by that assigned doctor', async () => {
    const transaction = {
      followUpPlan: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const { service } = serviceWithTransaction(transaction);

    await service.findForDoctor('doctor-user', 'patient-1', 1, 20);

    expect(transaction.followUpPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: 'patient-1', doctorId: 'doctor-1' },
      }),
    );
    expect(transaction.followUpPlan.count).toHaveBeenCalledWith({
      where: { patientId: 'patient-1', doctorId: 'doctor-1' },
    });
  });

  it('rejects an empty update before checking an assignment', async () => {
    const { service, requireAssignedPatient } = serviceWithTransaction({});

    await expect(
      service.updatePlan('doctor-user', 'patient-1', 'plan-1', {}),
    ).rejects.toEqual(
      new BadRequestException('At least one follow-up plan field is required'),
    );
    expect(requireAssignedPatient).not.toHaveBeenCalled();
  });
});
