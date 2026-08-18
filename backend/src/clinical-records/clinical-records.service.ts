import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DoctorNoteCategory, Prisma } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { paginationMetadata } from '../common/dto/pagination-query.dto';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDoctorNoteDto,
  CreatePatientFollowUpDto,
  UpdateDoctorNoteDto,
} from './dto/doctor-record.dto';

const doctorRecordRelations = {
  doctor: {
    select: {
      id: true,
      specialization: true,
      user: { select: { id: true, name: true } },
    },
  },
  appointment: {
    select: { id: true, appointmentDate: true, status: true },
  },
} satisfies Prisma.DoctorNoteInclude;

@Injectable()
export class ClinicalRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
  ) {}

  async findNotesForDoctor(
    doctorUserId: string,
    patientId: string,
    page: number,
    pageSize: number,
  ) {
    await this.access.requireAssignedPatient(doctorUserId, patientId);
    return this.findNotes(patientId, page, pageSize, doctorUserId);
  }

  async findNotesForPatient(
    patientUserId: string,
    page: number,
    pageSize: number,
  ) {
    const patient = await this.access.getPatientForUser(patientUserId);
    return this.findNotes(patient.id, page, pageSize, patientUserId);
  }

  async createNote(
    doctorUserId: string,
    patientId: string,
    dto: CreateDoctorNoteDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
      );
      await this.assertAppointment(
        transaction,
        dto.appointmentId,
        patientId,
        doctor.id,
      );
      const note = await transaction.doctorNote.create({
        data: {
          patientId,
          doctorId: doctor.id,
          title: dto.title,
          content: dto.content,
          category: dto.category ?? DoctorNoteCategory.GENERAL,
          appointmentId: dto.appointmentId ?? null,
        },
        include: doctorRecordRelations,
      });
      await this.audit.record(
        {
          userId: doctorUserId,
          action: 'DOCTOR_NOTE_CREATED',
          entity: 'DoctorNote',
          entityId: note.id,
          metadata: {
            patientId,
            doctorId: doctor.id,
            appointmentId: note.appointmentId,
            noteCategory: note.category,
          },
        },
        transaction,
      );
      return note;
    });
  }

  async updateNote(
    doctorUserId: string,
    patientId: string,
    noteId: string,
    dto: UpdateDoctorNoteDto,
  ) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one note field is required');
    }

    return this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
      );
      const existing = await transaction.doctorNote.findFirst({
        where: { id: noteId, patientId, doctorId: doctor.id },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundException('Doctor note not found');
      }

      await this.assertAppointment(
        transaction,
        dto.appointmentId,
        patientId,
        doctor.id,
      );
      const note = await transaction.doctorNote.update({
        where: { id: existing.id },
        data: {
          title: dto.title,
          content: dto.content,
          category: dto.category,
          appointmentId: dto.appointmentId,
        },
        include: doctorRecordRelations,
      });
      await this.audit.record(
        {
          userId: doctorUserId,
          action: 'DOCTOR_NOTE_UPDATED',
          entity: 'DoctorNote',
          entityId: note.id,
          metadata: {
            patientId,
            doctorId: doctor.id,
            appointmentId: note.appointmentId,
            noteCategory: note.category,
          },
        },
        transaction,
      );
      return note;
    });
  }

  async findFollowUpsForDoctor(
    doctorUserId: string,
    patientId: string,
    page: number,
    pageSize: number,
  ) {
    await this.access.requireAssignedPatient(doctorUserId, patientId);
    return this.findFollowUps(patientId, page, pageSize, doctorUserId);
  }

  async findFollowUpsForPatient(
    patientUserId: string,
    page: number,
    pageSize: number,
  ) {
    const patient = await this.access.getPatientForUser(patientUserId);
    return this.findFollowUps(patient.id, page, pageSize, patientUserId);
  }

  async createFollowUp(
    doctorUserId: string,
    patientId: string,
    dto: CreatePatientFollowUpDto,
  ) {
    const occurredAt = new Date(dto.occurredAt);
    if (occurredAt.getTime() > Date.now()) {
      throw new BadRequestException('occurredAt cannot be in the future');
    }
    const followUpAt = dto.followUpAt ? new Date(dto.followUpAt) : null;
    if (followUpAt && followUpAt.getTime() < occurredAt.getTime()) {
      throw new BadRequestException('followUpAt cannot be before occurredAt');
    }

    return this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
      );
      await this.assertAppointment(
        transaction,
        dto.appointmentId,
        patientId,
        doctor.id,
      );
      const followUp = await transaction.patientFollowUp.create({
        data: {
          patientId,
          doctorId: doctor.id,
          appointmentId: dto.appointmentId ?? null,
          summary: dto.summary,
          recommendations: dto.recommendations ?? null,
          occurredAt,
          followUpAt,
        },
        include: doctorRecordRelations,
      });
      await this.audit.record(
        {
          userId: doctorUserId,
          action: 'PATIENT_FOLLOW_UP_RECORDED',
          entity: 'PatientFollowUp',
          entityId: followUp.id,
          metadata: {
            patientId,
            doctorId: doctor.id,
            appointmentId: followUp.appointmentId,
          },
        },
        transaction,
      );
      return followUp;
    });
  }

  private async findNotes(
    patientId: string,
    page: number,
    pageSize: number,
    actorUserId: string,
  ) {
    const where = { patientId } satisfies Prisma.DoctorNoteWhereInput;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.doctorNote.findMany({
        where,
        include: doctorRecordRelations,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.doctorNote.count({ where }),
    ]);
    await this.audit.record({
      userId: actorUserId,
      action: 'DOCTOR_NOTE_LIST_ACCESSED',
      entity: 'DoctorNote',
      metadata: { patientId, count: items.length },
    });
    return { items, pagination: paginationMetadata(page, pageSize, total) };
  }

  private async findFollowUps(
    patientId: string,
    page: number,
    pageSize: number,
    actorUserId: string,
  ) {
    const where = { patientId } satisfies Prisma.PatientFollowUpWhereInput;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.patientFollowUp.findMany({
        where,
        include: doctorRecordRelations,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.patientFollowUp.count({ where }),
    ]);
    await this.audit.record({
      userId: actorUserId,
      action: 'PATIENT_FOLLOW_UP_LIST_ACCESSED',
      entity: 'PatientFollowUp',
      metadata: { patientId, count: items.length },
    });
    return { items, pagination: paginationMetadata(page, pageSize, total) };
  }

  private async assertAppointment(
    transaction: Prisma.TransactionClient,
    appointmentId: string | null | undefined,
    patientId: string,
    doctorId: string,
  ): Promise<void> {
    if (!appointmentId) return;
    const appointment = await transaction.appointment.findFirst({
      where: { id: appointmentId, patientId, doctorId },
      select: { id: true },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found for this care pair');
    }
  }
}
