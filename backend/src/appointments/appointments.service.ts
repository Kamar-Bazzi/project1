import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  AppointmentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';

import { paginationMetadata } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentQueryDto } from './dto/appointment-query.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

export interface AppointmentActor {
  id: string;
  role: UserRole;
}

const appointmentInclude = {
  patient: {
    select: {
      id: true,
      dateOfBirth: true,
      phoneNumber: true,
      timeZone: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
  doctor: {
    select: {
      id: true,
      specialization: true,
      licenseNumber: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.AppointmentInclude;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor: AppointmentActor, query: AppointmentQueryDto) {
    this.assertDateRange(query.from, query.to);
    const where: Prisma.AppointmentWhereInput = {
      AND: [
        this.scopeForActor(actor),
        {
          status: query.status,
          appointmentDate:
            query.from || query.to
              ? {
                  gte: query.from ? new Date(query.from) : undefined,
                  lte: query.to ? new Date(query.to) : undefined,
                }
              : undefined,
        },
      ],
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        orderBy: [{ appointmentDate: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    await this.recordReadAudit(actor, 'APPOINTMENT_LIST_ACCESSED', undefined, {
      resultCount: items.length,
      total,
    });

    return {
      items,
      pagination: paginationMetadata(query.page, query.pageSize, total),
    };
  }

  async findOne(actor: AppointmentActor, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        AND: [this.scopeForActor(actor)],
      },
      include: appointmentInclude,
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    await this.recordReadAudit(actor, 'APPOINTMENT_ACCESSED', appointment.id, {
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
    });
    return appointment;
  }

  async listAvailableDoctors(actor: AppointmentActor) {
    const where: Prisma.DoctorWhereInput = {
      user: {
        role: UserRole.DOCTOR,
        accountStatus: AccountStatus.ACTIVE,
      },
    };

    if (actor.role === UserRole.PATIENT) {
      where.patientAccessGrants = {
        some: {
          active: true,
          patient: { userId: actor.id },
        },
      };
    } else if (actor.role === UserRole.DOCTOR) {
      where.userId = actor.id;
    }

    return this.prisma.doctor.findMany({
      where,
      select: {
        id: true,
        specialization: true,
        licenseNumber: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async create(actor: AppointmentActor, dto: CreateAppointmentDto) {
    const appointmentDate = new Date(dto.appointmentDate);
    this.assertFutureAppointment(appointmentDate);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const { patientId, doctorId } = await this.resolveCreateParticipants(
          transaction,
          actor,
          dto,
        );

        await this.assertTimeAvailable(
          transaction,
          patientId,
          doctorId,
          appointmentDate,
        );

        const appointment = await transaction.appointment.create({
          data: {
            patientId,
            doctorId,
            appointmentDate,
            notes: dto.notes ?? null,
          },
          include: appointmentInclude,
        });

        await this.recordAudit(
          transaction,
          actor.id,
          'APPOINTMENT_CREATED',
          appointment,
        );

        return appointment;
      });
    } catch (error) {
      this.rethrowAppointmentConflict(error);
    }
  }

  async update(
    actor: AppointmentActor,
    appointmentId: string,
    dto: UpdateAppointmentDto,
  ) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException(
        'At least one appointment field is required',
      );
    }

    if (
      actor.role === UserRole.PATIENT &&
      dto.status !== undefined &&
      dto.status !== AppointmentStatus.CANCELLED
    ) {
      throw new BadRequestException('Patients may only cancel appointments');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.appointment.findFirst({
          where: {
            id: appointmentId,
            AND: [this.scopeForActor(actor)],
          },
        });

        if (!existing) {
          throw new NotFoundException('Appointment not found');
        }

        if (existing.status !== AppointmentStatus.SCHEDULED) {
          throw new BadRequestException(
            'Completed or cancelled appointments cannot be changed',
          );
        }

        const appointmentDate = dto.appointmentDate
          ? new Date(dto.appointmentDate)
          : existing.appointmentDate;

        if (dto.appointmentDate) {
          this.assertFutureAppointment(appointmentDate);
          await this.assertTimeAvailable(
            transaction,
            existing.patientId,
            existing.doctorId,
            appointmentDate,
            existing.id,
          );
        }

        const appointment = await transaction.appointment.update({
          where: { id: existing.id },
          data: {
            appointmentDate:
              dto.appointmentDate === undefined ? undefined : appointmentDate,
            status: dto.status,
            notes: dto.notes,
          },
          include: appointmentInclude,
        });

        await this.recordAudit(
          transaction,
          actor.id,
          dto.status === AppointmentStatus.CANCELLED
            ? 'APPOINTMENT_CANCELLED'
            : dto.status === AppointmentStatus.COMPLETED
              ? 'APPOINTMENT_COMPLETED'
              : 'APPOINTMENT_UPDATED',
          appointment,
        );

        return appointment;
      });
    } catch (error) {
      this.rethrowAppointmentConflict(error);
    }
  }

  async remove(actor: AppointmentActor, appointmentId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.appointment.findFirst({
        where: {
          id: appointmentId,
          AND: [this.scopeForActor(actor)],
        },
      });

      if (!existing) {
        throw new NotFoundException('Appointment not found');
      }

      if (actor.role === UserRole.ADMIN) {
        await transaction.appointment.delete({ where: { id: existing.id } });
        await this.recordAudit(
          transaction,
          actor.id,
          'APPOINTMENT_DELETED',
          existing,
        );
        return;
      }

      if (existing.status !== AppointmentStatus.SCHEDULED) {
        throw new BadRequestException(
          'Only scheduled appointments can be cancelled',
        );
      }

      const cancelled = await transaction.appointment.update({
        where: { id: existing.id },
        data: { status: AppointmentStatus.CANCELLED },
      });
      await this.recordAudit(
        transaction,
        actor.id,
        'APPOINTMENT_CANCELLED',
        cancelled,
      );
    });
  }

  private scopeForActor(actor: AppointmentActor): Prisma.AppointmentWhereInput {
    if (actor.role === UserRole.PATIENT) {
      return { patient: { userId: actor.id } };
    }

    if (actor.role === UserRole.DOCTOR) {
      return {
        doctor: { userId: actor.id },
        patient: {
          doctorAccessGrants: {
            some: {
              active: true,
              doctor: { userId: actor.id },
            },
          },
        },
      };
    }

    return {};
  }

  private async resolveCreateParticipants(
    transaction: Prisma.TransactionClient,
    actor: AppointmentActor,
    dto: CreateAppointmentDto,
  ): Promise<{ patientId: string; doctorId: string }> {
    if (actor.role === UserRole.PATIENT) {
      if (dto.patientId !== undefined) {
        throw new BadRequestException(
          'Patients cannot create appointments for another patient',
        );
      }
      if (!dto.doctorId) {
        throw new BadRequestException('doctorId is required');
      }

      const patient = await transaction.patient.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      if (!patient) {
        throw new NotFoundException('Patient profile not found');
      }

      const assignedDoctor = await transaction.doctor.findFirst({
        where: {
          id: dto.doctorId,
          user: {
            role: UserRole.DOCTOR,
            accountStatus: AccountStatus.ACTIVE,
          },
          patientAccessGrants: {
            some: { patientId: patient.id, active: true },
          },
        },
        select: { id: true },
      });
      if (!assignedDoctor) {
        throw new NotFoundException('Assigned doctor not found');
      }

      return { patientId: patient.id, doctorId: assignedDoctor.id };
    }

    if (actor.role === UserRole.DOCTOR) {
      if (!dto.patientId) {
        throw new BadRequestException('patientId is required');
      }

      const doctor = await transaction.doctor.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      if (!doctor) {
        throw new NotFoundException('Doctor profile not found');
      }
      if (dto.doctorId !== undefined && dto.doctorId !== doctor.id) {
        throw new BadRequestException(
          'Doctors cannot create appointments for another doctor',
        );
      }

      const assignedPatient = await transaction.patient.findFirst({
        where: {
          id: dto.patientId,
          user: {
            role: UserRole.PATIENT,
            accountStatus: AccountStatus.ACTIVE,
          },
          doctorAccessGrants: {
            some: { doctorId: doctor.id, active: true },
          },
        },
        select: { id: true },
      });
      if (!assignedPatient) {
        throw new NotFoundException('Assigned patient not found');
      }

      return { patientId: assignedPatient.id, doctorId: doctor.id };
    }

    if (!dto.patientId || !dto.doctorId) {
      throw new BadRequestException(
        'patientId and doctorId are required for administrators',
      );
    }

    const [patient, doctor] = await Promise.all([
      transaction.patient.findFirst({
        where: {
          id: dto.patientId,
          user: {
            role: UserRole.PATIENT,
            accountStatus: AccountStatus.ACTIVE,
          },
        },
        select: { id: true },
      }),
      transaction.doctor.findFirst({
        where: {
          id: dto.doctorId,
          user: {
            role: UserRole.DOCTOR,
            accountStatus: AccountStatus.ACTIVE,
          },
        },
        select: { id: true },
      }),
    ]);

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    return { patientId: patient.id, doctorId: doctor.id };
  }

  private async assertTimeAvailable(
    transaction: Prisma.TransactionClient,
    patientId: string,
    doctorId: string,
    appointmentDate: Date,
    excludeId?: string,
  ): Promise<void> {
    const collision = await transaction.appointment.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        appointmentDate,
        status: AppointmentStatus.SCHEDULED,
        OR: [{ patientId }, { doctorId }],
      },
      select: { id: true },
    });

    if (collision) {
      throw new ConflictException(
        'The patient or doctor already has an appointment at this time',
      );
    }
  }

  private assertFutureAppointment(appointmentDate: Date): void {
    if (appointmentDate.getTime() <= Date.now()) {
      throw new BadRequestException('appointmentDate must be in the future');
    }
  }

  private assertDateRange(from?: string, to?: string): void {
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      throw new BadRequestException('from must be before or equal to to');
    }
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    actorUserId: string,
    action: string,
    appointment: {
      id: string;
      patientId: string;
      doctorId: string;
      status: AppointmentStatus;
    },
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        userId: actorUserId,
        action,
        entity: 'Appointment',
        entityId: appointment.id,
        metadata: {
          patientId: appointment.patientId,
          doctorId: appointment.doctorId,
          status: appointment.status,
        },
      },
    });
  }

  private async recordReadAudit(
    actor: AppointmentActor,
    action: string,
    entityId: string | undefined,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    if (!this.prisma.auditLog?.create) return;
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action,
        entity: 'Appointment',
        entityId,
        metadata: { role: actor.role, ...metadata },
      },
    });
  }

  private rethrowAppointmentConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'The patient or doctor already has an appointment at this time',
      );
    }

    throw error;
  }
}
