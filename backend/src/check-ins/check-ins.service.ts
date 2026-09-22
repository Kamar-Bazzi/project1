import { Injectable } from '@nestjs/common';
import type { DailyCheckIn } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { getLocalDayUtcRange } from '../common/time-zone/local-day';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertDailyCheckInDto } from './dto/check-in.dto';

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
  ) {}

  async listForPatient(userId: string, limit: number) {
    const patient = await this.access.getPatientForUser(userId);
    const items = await this.list(patient.id, limit);
    await this.audit.record({
      userId,
      action: 'DAILY_CHECK_IN_HISTORY_ACCESSED',
      entity: 'DailyCheckIn',
      metadata: { patientId: patient.id, count: items.length },
    });
    return items.map((item) => this.toResponse(item));
  }

  async todayForPatient(
    userId: string,
    requestedTimeZone?: string,
    now = new Date(),
  ) {
    const patient = await this.access.getPatientForUser(userId);
    const day = getLocalDayUtcRange(now, patient.timeZone ?? requestedTimeZone);
    const item = await this.findToday(patient.id, day.dateKey);
    await this.audit.record({
      userId,
      action: 'DAILY_CHECK_IN_ACCESSED',
      entity: 'DailyCheckIn',
      entityId: item?.id,
      metadata: { patientId: patient.id },
    });
    return item ? this.toResponse(item) : null;
  }

  async upsertToday(
    userId: string,
    dto: UpsertDailyCheckInDto,
    requestedTimeZone?: string,
    now = new Date(),
  ) {
    const patient = await this.access.getPatientForUser(userId);
    const day = getLocalDayUtcRange(now, patient.timeZone ?? requestedTimeZone);
    const localDate = new Date(`${day.dateKey}T00:00:00.000Z`);
    return this.prisma.$transaction(async (transaction) => {
      const item = await transaction.dailyCheckIn.upsert({
        where: {
          patientId_localDate: { patientId: patient.id, localDate },
        },
        create: {
          patientId: patient.id,
          localDate,
          timeZone: day.timeZone,
          mood: dto.mood,
          painLevel: dto.painLevel,
          sleepQuality: dto.sleepQuality,
          symptoms: [...new Set(dto.symptoms)],
          activityMinutes: dto.activityMinutes,
          medicationAdherence: dto.medicationAdherence,
          notes: dto.notes ?? null,
        },
        update: {
          timeZone: day.timeZone,
          mood: dto.mood,
          painLevel: dto.painLevel,
          sleepQuality: dto.sleepQuality,
          symptoms: [...new Set(dto.symptoms)],
          activityMinutes: dto.activityMinutes,
          medicationAdherence: dto.medicationAdherence,
          notes: dto.notes ?? null,
        },
      });
      await this.audit.record(
        {
          userId,
          action: 'DAILY_CHECK_IN_UPSERTED',
          entity: 'DailyCheckIn',
          entityId: item.id,
          metadata: { patientId: patient.id },
        },
        transaction,
      );
      return this.toResponse(item);
    });
  }

  async listForDoctor(doctorUserId: string, patientId: string, limit: number) {
    await this.access.requireAssignedPatient(doctorUserId, patientId);
    const items = await this.list(patientId, limit);
    await this.audit.record({
      userId: doctorUserId,
      action: 'DOCTOR_DAILY_CHECK_IN_HISTORY_ACCESSED',
      entity: 'DailyCheckIn',
      metadata: { patientId, count: items.length },
    });
    return items.map((item) => this.toResponse(item));
  }

  async todayForDoctor(
    doctorUserId: string,
    patientId: string,
    now = new Date(),
  ) {
    const { patient } = await this.access.requireAssignedPatient(
      doctorUserId,
      patientId,
    );
    const day = getLocalDayUtcRange(now, patient.timeZone);
    const item = await this.findToday(patientId, day.dateKey);
    await this.audit.record({
      userId: doctorUserId,
      action: 'DOCTOR_DAILY_CHECK_IN_ACCESSED',
      entity: 'DailyCheckIn',
      entityId: item?.id,
      metadata: { patientId },
    });
    return item ? this.toResponse(item) : null;
  }

  private list(patientId: string, limit: number) {
    return this.prisma.dailyCheckIn.findMany({
      where: { patientId },
      orderBy: { localDate: 'desc' },
      take: limit,
    });
  }

  private findToday(patientId: string, dateKey: string) {
    return this.prisma.dailyCheckIn.findUnique({
      where: {
        patientId_localDate: {
          patientId,
          localDate: new Date(`${dateKey}T00:00:00.000Z`),
        },
      },
    });
  }

  private toResponse(item: DailyCheckIn) {
    return {
      ...item,
      localDate: item.localDate.toISOString().slice(0, 10),
    };
  }
}
