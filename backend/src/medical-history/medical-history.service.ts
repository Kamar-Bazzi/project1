import { BadRequestException, Injectable } from '@nestjs/common';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { paginationMetadata } from '../common/dto/pagination-query.dto';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MedicalHistoryEventType,
  MedicalHistoryQueryDto,
} from './dto/medical-history-query.dto';

export interface MedicalHistoryItem {
  id: string;
  type: MedicalHistoryEventType;
  occurredAt: Date;
  title: string;
  summary: string;
  status: string | null;
  data: Record<string, unknown>;
}

@Injectable()
export class MedicalHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
  ) {}

  async findForPatient(userId: string, query: MedicalHistoryQueryDto) {
    const patient = await this.access.getPatientForUser(userId);
    return this.buildTimeline(patient, userId, query);
  }

  async findForDoctor(
    doctorUserId: string,
    patientId: string,
    query: MedicalHistoryQueryDto,
  ) {
    const { patient } = await this.access.requireAssignedPatient(
      doctorUserId,
      patientId,
    );
    return this.buildTimeline(patient, doctorUserId, query);
  }

  private async buildTimeline(
    patient: {
      id: string;
      user: { id: string; name: string; email: string };
    },
    actorUserId: string,
    query: MedicalHistoryQueryDto,
  ) {
    const sourceLimit = query.page * query.pageSize;
    if (sourceLimit > 5_000) {
      throw new BadRequestException(
        'Requested medical-history page is beyond the supported window',
      );
    }

    const to = new Date();
    const from = new Date(to.getTime() - query.period * 24 * 60 * 60 * 1_000);
    const range = { gte: from, lte: to };
    const requested = new Set(
      query.types ?? Object.values(MedicalHistoryEventType),
    );
    const patientFor = (type: MedicalHistoryEventType) =>
      requested.has(type) ? patient.id : '__excluded__';

    const [
      medications,
      medicationLogs,
      measurements,
      healthMetrics,
      healthAlerts,
      appointments,
      doctorNotes,
      followUps,
      medicationCount,
      medicationLogCount,
      measurementCount,
      healthMetricCount,
      healthAlertCount,
      appointmentCount,
      doctorNoteCount,
      followUpCount,
    ] = await this.prisma.$transaction([
      this.prisma.medication.findMany({
        where: {
          patientId: patientFor(MedicalHistoryEventType.MEDICATION),
          createdAt: range,
        },
        orderBy: { createdAt: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.medicationLog.findMany({
        where: {
          medication: {
            patientId: patientFor(MedicalHistoryEventType.MEDICATION_LOG),
          },
          scheduledFor: range,
        },
        include: {
          medication: { select: { name: true, dosage: true } },
        },
        orderBy: { scheduledFor: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.measurement.findMany({
        where: {
          patientId: patientFor(MedicalHistoryEventType.MEASUREMENT),
          measuredAt: range,
        },
        orderBy: { measuredAt: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.healthMetric.findMany({
        where: {
          patientId: patientFor(MedicalHistoryEventType.WEARABLE_METRIC),
          measuredAt: range,
        },
        orderBy: { measuredAt: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.healthAlert.findMany({
        where: {
          patientId: patientFor(MedicalHistoryEventType.HEALTH_ALERT),
          detectedAt: range,
        },
        orderBy: { detectedAt: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.appointment.findMany({
        where: {
          patientId: patientFor(MedicalHistoryEventType.APPOINTMENT),
          appointmentDate: range,
        },
        include: {
          doctor: {
            select: {
              id: true,
              specialization: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { appointmentDate: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.doctorNote.findMany({
        where: {
          patientId: patientFor(MedicalHistoryEventType.DOCTOR_NOTE),
          createdAt: range,
        },
        include: {
          doctor: {
            select: {
              id: true,
              specialization: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.patientFollowUp.findMany({
        where: {
          patientId: patientFor(MedicalHistoryEventType.FOLLOW_UP),
          occurredAt: range,
        },
        include: {
          doctor: {
            select: {
              id: true,
              specialization: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { occurredAt: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.medication.count({
        where: {
          patientId: patientFor(MedicalHistoryEventType.MEDICATION),
          createdAt: range,
        },
      }),
      this.prisma.medicationLog.count({
        where: {
          medication: {
            patientId: patientFor(MedicalHistoryEventType.MEDICATION_LOG),
          },
          scheduledFor: range,
        },
      }),
      this.prisma.measurement.count({
        where: {
          patientId: patientFor(MedicalHistoryEventType.MEASUREMENT),
          measuredAt: range,
        },
      }),
      this.prisma.healthMetric.count({
        where: {
          patientId: patientFor(MedicalHistoryEventType.WEARABLE_METRIC),
          measuredAt: range,
        },
      }),
      this.prisma.healthAlert.count({
        where: {
          patientId: patientFor(MedicalHistoryEventType.HEALTH_ALERT),
          detectedAt: range,
        },
      }),
      this.prisma.appointment.count({
        where: {
          patientId: patientFor(MedicalHistoryEventType.APPOINTMENT),
          appointmentDate: range,
        },
      }),
      this.prisma.doctorNote.count({
        where: {
          patientId: patientFor(MedicalHistoryEventType.DOCTOR_NOTE),
          createdAt: range,
        },
      }),
      this.prisma.patientFollowUp.count({
        where: {
          patientId: patientFor(MedicalHistoryEventType.FOLLOW_UP),
          occurredAt: range,
        },
      }),
    ]);

    const items: MedicalHistoryItem[] = [
      ...medications.map((medication) => ({
        id: medication.id,
        type: MedicalHistoryEventType.MEDICATION,
        occurredAt: medication.createdAt,
        title: medication.name,
        summary: `${medication.dosage} medication record`,
        status: medication.status,
        data: {
          dosage: medication.dosage,
          instructions: medication.instructions,
          startDate: medication.startDate,
          endDate: medication.endDate,
        },
      })),
      ...medicationLogs.map((log) => ({
        id: log.id,
        type: MedicalHistoryEventType.MEDICATION_LOG,
        occurredAt: log.takenAt ?? log.scheduledFor,
        title: log.medication.name,
        summary: `${log.medication.dosage} dose marked ${log.status.toLowerCase()}`,
        status: log.status,
        data: {
          scheduledFor: log.scheduledFor,
          takenAt: log.takenAt,
        },
      })),
      ...measurements.map((measurement) => ({
        id: measurement.id,
        type: MedicalHistoryEventType.MEASUREMENT,
        occurredAt: measurement.measuredAt,
        title: measurement.type.replaceAll('_', ' ').toLowerCase(),
        summary: `${measurement.value}${measurement.secondaryValue === null ? '' : `/${measurement.secondaryValue}`} ${measurement.unit}`,
        status: null,
        data: {
          measurementType: measurement.type,
          value: measurement.value,
          secondaryValue: measurement.secondaryValue,
          unit: measurement.unit,
        },
      })),
      ...healthMetrics.map((metric) => ({
        id: metric.id,
        type: MedicalHistoryEventType.WEARABLE_METRIC,
        occurredAt: metric.measuredAt,
        title: metric.metricType.replaceAll('_', ' ').toLowerCase(),
        summary: `${metric.value}${metric.secondaryValue === null ? '' : `/${metric.secondaryValue}`} ${metric.unit}`,
        status: null,
        data: {
          metricType: metric.metricType,
          value: metric.value,
          secondaryValue: metric.secondaryValue,
          unit: metric.unit,
          source: metric.source,
        },
      })),
      ...healthAlerts.map((alert) => ({
        id: alert.id,
        type: MedicalHistoryEventType.HEALTH_ALERT,
        occurredAt: alert.detectedAt,
        title: `${alert.severity.toLowerCase()} health alert`,
        summary: alert.message,
        status: alert.status,
        data: {
          metricType: alert.metricType,
          severity: alert.severity,
          acknowledgedAt: alert.acknowledgedAt,
          resolvedAt: alert.resolvedAt,
        },
      })),
      ...appointments.map((appointment) => ({
        id: appointment.id,
        type: MedicalHistoryEventType.APPOINTMENT,
        occurredAt: appointment.appointmentDate,
        title: `Appointment with ${appointment.doctor.user.name}`,
        summary: appointment.notes ?? 'No appointment notes recorded',
        status: appointment.status,
        data: {
          doctor: appointment.doctor,
        },
      })),
      ...doctorNotes.map((note) => ({
        id: note.id,
        type: MedicalHistoryEventType.DOCTOR_NOTE,
        occurredAt: note.createdAt,
        title: note.title,
        summary: note.content,
        status: note.category,
        data: {
          doctor: note.doctor,
          appointmentId: note.appointmentId,
          updatedAt: note.updatedAt,
        },
      })),
      ...followUps.map((followUp) => ({
        id: followUp.id,
        type: MedicalHistoryEventType.FOLLOW_UP,
        occurredAt: followUp.occurredAt,
        title: 'Patient follow-up',
        summary: followUp.summary,
        status: null,
        data: {
          doctor: followUp.doctor,
          recommendations: followUp.recommendations,
          followUpAt: followUp.followUpAt,
          appointmentId: followUp.appointmentId,
        },
      })),
    ].sort(
      (first, second) =>
        second.occurredAt.getTime() - first.occurredAt.getTime() ||
        first.id.localeCompare(second.id),
    );

    const byType = {
      [MedicalHistoryEventType.MEDICATION]: medicationCount,
      [MedicalHistoryEventType.MEDICATION_LOG]: medicationLogCount,
      [MedicalHistoryEventType.MEASUREMENT]: measurementCount,
      [MedicalHistoryEventType.WEARABLE_METRIC]: healthMetricCount,
      [MedicalHistoryEventType.HEALTH_ALERT]: healthAlertCount,
      [MedicalHistoryEventType.APPOINTMENT]: appointmentCount,
      [MedicalHistoryEventType.DOCTOR_NOTE]: doctorNoteCount,
      [MedicalHistoryEventType.FOLLOW_UP]: followUpCount,
    };
    const total = Object.values(byType).reduce((sum, count) => sum + count, 0);
    const start = (query.page - 1) * query.pageSize;
    const pagedItems = items.slice(start, start + query.pageSize);

    await this.audit.record({
      userId: actorUserId,
      action: 'MEDICAL_HISTORY_ACCESSED',
      entity: 'Patient',
      entityId: patient.id,
      metadata: {
        patientId: patient.id,
        periodDays: query.period,
        count: pagedItems.length,
        timelineTypes: query.types?.join(',') ?? 'ALL',
      },
    });

    return {
      patient,
      items: pagedItems,
      pagination: paginationMetadata(query.page, query.pageSize, total),
      summary: { total, byType },
      period: { days: query.period, from, to },
    };
  }
}
