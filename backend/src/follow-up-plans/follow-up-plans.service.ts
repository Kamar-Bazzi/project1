import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FollowUpPlanStatus, FollowUpTaskStatus, Prisma } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { paginationMetadata } from '../common/dto/pagination-query.dto';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFollowUpPlanDto,
  CreateFollowUpTaskDto,
  UpdateFollowUpPlanDto,
  UpdateFollowUpTaskDto,
} from './dto/follow-up-plan.dto';

const followUpPlanRelations = {
  doctor: {
    select: {
      id: true,
      specialization: true,
      user: { select: { id: true, name: true } },
    },
  },
  tasks: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.FollowUpPlanInclude;

@Injectable()
export class FollowUpPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
  ) {}

  async findForDoctor(
    doctorUserId: string,
    patientId: string,
    page: number,
    pageSize: number,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
      );
      return this.findPlans(
        transaction,
        patientId,
        doctorUserId,
        page,
        pageSize,
        doctor.id,
      );
    });
  }

  async findForPatient(patientUserId: string, page: number, pageSize: number) {
    return this.prisma.$transaction(async (transaction) => {
      const patient = await this.access.getPatientForUser(
        patientUserId,
        transaction,
      );
      return this.findPlans(
        transaction,
        patient.id,
        patientUserId,
        page,
        pageSize,
      );
    });
  }

  async createPlan(
    doctorUserId: string,
    patientId: string,
    dto: CreateFollowUpPlanDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
      );
      const plan = await transaction.followUpPlan.create({
        data: {
          patientId,
          doctorId: doctor.id,
          title: dto.title,
          notes: dto.notes ?? null,
          nextReviewAt: this.toNullableDate(dto.nextReviewAt),
          status: dto.status ?? FollowUpPlanStatus.ACTIVE,
          tasks:
            dto.tasks === undefined
              ? undefined
              : {
                  create: dto.tasks.map((task) => ({
                    title: task.title,
                    notes: task.notes ?? null,
                    dueAt: this.toNullableDate(task.dueAt),
                  })),
                },
        },
        include: followUpPlanRelations,
      });
      await this.audit.record(
        {
          userId: doctorUserId,
          action: 'FOLLOW_UP_PLAN_CREATED',
          entity: 'FollowUpPlan',
          entityId: plan.id,
          metadata: {
            patientId,
            doctorId: doctor.id,
            status: plan.status,
            count: plan.tasks.length,
          },
        },
        transaction,
      );
      return plan;
    });
  }

  async updatePlan(
    doctorUserId: string,
    patientId: string,
    planId: string,
    dto: UpdateFollowUpPlanDto,
  ) {
    this.requireUpdate(dto, 'At least one follow-up plan field is required');

    return this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
      );
      const existing = await transaction.followUpPlan.findFirst({
        where: { id: planId, patientId, doctorId: doctor.id },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Follow-up plan not found');
      }

      const plan = await transaction.followUpPlan.update({
        where: { id: existing.id },
        data: {
          title: dto.title,
          notes: dto.notes,
          nextReviewAt:
            dto.nextReviewAt === undefined
              ? undefined
              : this.toNullableDate(dto.nextReviewAt),
          status: dto.status,
        },
        include: followUpPlanRelations,
      });
      await this.audit.record(
        {
          userId: doctorUserId,
          action: 'FOLLOW_UP_PLAN_UPDATED',
          entity: 'FollowUpPlan',
          entityId: plan.id,
          metadata: {
            patientId,
            doctorId: doctor.id,
            status: plan.status,
          },
        },
        transaction,
      );
      return plan;
    });
  }

  async createTask(
    doctorUserId: string,
    patientId: string,
    planId: string,
    dto: CreateFollowUpTaskDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
      );
      const plan = await transaction.followUpPlan.findFirst({
        where: { id: planId, patientId, doctorId: doctor.id },
        select: { id: true },
      });
      if (!plan) {
        throw new NotFoundException('Follow-up plan not found');
      }

      const task = await transaction.followUpTask.create({
        data: {
          followUpPlanId: plan.id,
          title: dto.title,
          notes: dto.notes ?? null,
          dueAt: this.toNullableDate(dto.dueAt),
        },
      });
      await this.audit.record(
        {
          userId: doctorUserId,
          action: 'FOLLOW_UP_TASK_CREATED',
          entity: 'FollowUpTask',
          entityId: task.id,
          metadata: {
            patientId,
            doctorId: doctor.id,
            status: task.status,
          },
        },
        transaction,
      );
      return task;
    });
  }

  async updateTask(
    doctorUserId: string,
    patientId: string,
    planId: string,
    taskId: string,
    dto: UpdateFollowUpTaskDto,
  ) {
    this.requireUpdate(dto, 'At least one follow-up task field is required');

    return this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
      );
      const existing = await transaction.followUpTask.findFirst({
        where: {
          id: taskId,
          followUpPlanId: planId,
          followUpPlan: { patientId, doctorId: doctor.id },
        },
        select: { id: true, status: true, completedAt: true },
      });
      if (!existing) {
        throw new NotFoundException('Follow-up task not found');
      }

      const task = await transaction.followUpTask.update({
        where: { id: existing.id },
        data: {
          title: dto.title,
          notes: dto.notes,
          dueAt:
            dto.dueAt === undefined
              ? undefined
              : this.toNullableDate(dto.dueAt),
          status: dto.status,
          completedAt:
            dto.status === undefined
              ? undefined
              : dto.status === FollowUpTaskStatus.DONE
                ? (existing.completedAt ?? new Date())
                : null,
        },
      });
      await this.audit.record(
        {
          userId: doctorUserId,
          action: 'FOLLOW_UP_TASK_UPDATED',
          entity: 'FollowUpTask',
          entityId: task.id,
          metadata: {
            patientId,
            doctorId: doctor.id,
            status: task.status,
          },
        },
        transaction,
      );
      return task;
    });
  }

  private async findPlans(
    transaction: Prisma.TransactionClient,
    patientId: string,
    actorUserId: string,
    page: number,
    pageSize: number,
    doctorId?: string,
  ) {
    const where = {
      patientId,
      ...(doctorId ? { doctorId } : {}),
    } satisfies Prisma.FollowUpPlanWhereInput;
    const [items, total] = await Promise.all([
      transaction.followUpPlan.findMany({
        where,
        include: followUpPlanRelations,
        orderBy: [
          { status: 'asc' },
          { nextReviewAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      transaction.followUpPlan.count({ where }),
    ]);
    await this.audit.record(
      {
        userId: actorUserId,
        action: 'FOLLOW_UP_PLAN_LIST_ACCESSED',
        entity: 'FollowUpPlan',
        metadata: {
          patientId,
          ...(doctorId ? { doctorId } : {}),
          count: items.length,
          operation: 'LIST',
        },
      },
      transaction,
    );
    return { items, pagination: paginationMetadata(page, pageSize, total) };
  }

  private toNullableDate(value: string | null | undefined): Date | null {
    return value ? new Date(value) : null;
  }

  private requireUpdate(dto: object, message: string): void {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException(message);
    }
  }
}
