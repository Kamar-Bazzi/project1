import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  EmergencyEventStatus,
  HealthAlertSeverity,
  HealthAlertStatus,
  HealthGoalStatus,
  MedicationLogStatus,
} from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';

const REPORT_DISCLAIMER =
  'Trend and unusual-change flags are descriptive summaries of recorded data. They are not diagnoses, do not predict an emergency, and do not replace review by a qualified clinician.';

interface TrendReading {
  type: string;
  unit: string;
  value: number;
  measuredAt: Date;
}

export interface UnusualChange {
  source: 'MEASUREMENT' | 'WEARABLE' | 'ADHERENCE';
  metric: string;
  direction: 'INCREASED' | 'DECREASED';
  changePercent: number;
  observedAt: Date;
  description: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
  ) {}

  async getPatientReport(userId: string, periodDays: number) {
    const patient = await this.access.getPatientForUser(userId);
    return this.buildReport(patient, userId, periodDays, true);
  }

  async getDoctorPatientReport(
    doctorUserId: string,
    patientId: string,
    periodDays: number,
  ) {
    const { patient } = await this.access.requireAssignedPatient(
      doctorUserId,
      patientId,
    );
    return this.buildReport(patient, doctorUserId, periodDays, true);
  }

  async getDoctorMonitoring(doctorUserId: string, periodDays: number) {
    const doctor = await this.access.getDoctorForUser(doctorUserId);
    const patients = await this.prisma.patient.findMany({
      where: {
        doctorAccessGrants: {
          some: { doctorId: doctor.id, active: true },
        },
      },
      select: {
        id: true,
        userId: true,
        timeZone: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: 'asc' } },
      take: 100,
    });

    const monitoredPatients: Array<{
      patient: (typeof patients)[number];
      unusualChanges: UnusualChange[];
      unusualChangeCount: number;
      medicationAdherence: {
        scheduled: number;
        taken: number;
        missed: number;
        skipped: number;
        pending: number;
        adherenceRate: number | null;
        previousAdherenceRate: number | null;
        changePercentagePoints: number | null;
      };
      activeAlertCount: number;
      urgentAlertCount: number;
      activeEmergency: {
        id: string;
        patientId: string;
        status: EmergencyEventStatus;
        note: string | null;
        latitude: number | null;
        longitude: number | null;
        triggeredAt: Date;
        resolvedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      } | null;
      latestMeasurements: Array<{
        type: string;
        unit: string;
        latest: number;
        latestAt: Date;
        unusualChange: boolean;
      }>;
    }> = [];
    for (const patient of patients) {
      const report = await this.buildReport(
        patient,
        doctorUserId,
        periodDays,
        false,
      );
      monitoredPatients.push({
        patient,
        unusualChanges: report.unusualChanges,
        unusualChangeCount: report.unusualChanges.length,
        medicationAdherence: report.medicationAdherence,
        activeAlertCount: report.alerts.active,
        urgentAlertCount: report.alerts.urgent,
        activeEmergency: report.activeEmergency,
        latestMeasurements: report.measurements.map((trend) => ({
          type: trend.type,
          unit: trend.unit,
          latest: trend.latest,
          latestAt: trend.latestAt,
          unusualChange: trend.unusualChange,
        })),
      });
    }

    monitoredPatients.sort(
      (first, second) =>
        Number(Boolean(second.activeEmergency)) -
          Number(Boolean(first.activeEmergency)) ||
        second.urgentAlertCount - first.urgentAlertCount ||
        second.unusualChangeCount - first.unusualChangeCount ||
        first.patient.user.name.localeCompare(second.patient.user.name),
    );
    await this.audit.record({
      userId: doctorUserId,
      action: 'DOCTOR_MONITORING_ACCESSED',
      entity: 'Patient',
      metadata: {
        doctorId: doctor.id,
        periodDays,
        count: monitoredPatients.length,
      },
    });

    return {
      doctor,
      period: this.period(periodDays),
      patients: monitoredPatients,
      generatedAt: new Date(),
      disclaimer: REPORT_DISCLAIMER,
    };
  }

  private async buildReport(
    patient: {
      id: string;
      userId: string;
      timeZone: string | null;
      user: { id: string; name: string; email: string };
    },
    actorUserId: string,
    periodDays: number,
    recordAudit: boolean,
  ) {
    const to = new Date();
    const from = new Date(to.getTime() - periodDays * 86_400_000);
    const previousFrom = new Date(from.getTime() - periodDays * 86_400_000);
    const fullRange = { gte: previousFrom, lte: to };
    const currentRange = { gte: from, lte: to };

    const [
      measurements,
      metrics,
      medicationLogs,
      alerts,
      appointments,
      goals,
      activeEmergency,
    ] = await Promise.all([
      this.prisma.measurement.findMany({
        where: { patientId: patient.id, measuredAt: fullRange },
        orderBy: { measuredAt: 'asc' },
      }),
      this.prisma.healthMetric.findMany({
        where: { patientId: patient.id, measuredAt: fullRange },
        orderBy: { measuredAt: 'asc' },
      }),
      this.prisma.medicationLog.findMany({
        where: {
          medication: { patientId: patient.id },
          scheduledFor: fullRange,
        },
        orderBy: { scheduledFor: 'asc' },
      }),
      this.prisma.healthAlert.findMany({
        where: { patientId: patient.id, detectedAt: currentRange },
        orderBy: { detectedAt: 'desc' },
      }),
      this.prisma.appointment.findMany({
        where: { patientId: patient.id, appointmentDate: currentRange },
        orderBy: { appointmentDate: 'desc' },
      }),
      this.prisma.healthGoal.findMany({
        where: { patientId: patient.id, status: HealthGoalStatus.ACTIVE },
        include: {
          progress: { orderBy: { recordedAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.emergencyEvent.findFirst({
        where: {
          patientId: patient.id,
          status: EmergencyEventStatus.ACTIVE,
        },
        orderBy: { triggeredAt: 'desc' },
      }),
    ]);

    const unusualChanges: UnusualChange[] = [];
    const measurementTrends = this.buildTrends(
      measurements.map((measurement) => ({
        type: measurement.type,
        unit: measurement.unit,
        value: measurement.value,
        measuredAt: measurement.measuredAt,
      })),
      from,
      to,
      'MEASUREMENT',
      unusualChanges,
    );
    const wearableTrends = this.buildTrends(
      metrics.map((metric) => ({
        type: metric.metricType,
        unit: metric.unit,
        value: metric.value,
        measuredAt: metric.measuredAt,
      })),
      from,
      to,
      'WEARABLE',
      unusualChanges,
    );
    const medicationAdherence = this.adherenceSummary(medicationLogs, from, to);
    if (
      medicationAdherence.changePercentagePoints !== null &&
      medicationAdherence.changePercentagePoints <= -20
    ) {
      unusualChanges.push({
        source: 'ADHERENCE',
        metric: 'MEDICATION_ADHERENCE',
        direction: 'DECREASED',
        changePercent: Math.abs(medicationAdherence.changePercentagePoints),
        observedAt: to,
        description: `Recorded medication adherence decreased by ${Math.abs(medicationAdherence.changePercentagePoints).toFixed(1)} percentage points compared with the preceding period. This is a descriptive flag, not a diagnosis.`,
      });
    }

    const report = {
      patient,
      period: { days: periodDays, from, to, previousFrom },
      measurements: measurementTrends,
      wearableMetrics: wearableTrends,
      medicationAdherence,
      alerts: {
        total: alerts.length,
        active: alerts.filter(
          (alert) => alert.status === HealthAlertStatus.ACTIVE,
        ).length,
        urgent: alerts.filter(
          (alert) => alert.severity === HealthAlertSeverity.URGENT,
        ).length,
        bySeverity: {
          info: alerts.filter(
            (alert) => alert.severity === HealthAlertSeverity.INFO,
          ).length,
          warning: alerts.filter(
            (alert) => alert.severity === HealthAlertSeverity.WARNING,
          ).length,
          urgent: alerts.filter(
            (alert) => alert.severity === HealthAlertSeverity.URGENT,
          ).length,
        },
      },
      appointments: {
        total: appointments.length,
        scheduled: appointments.filter(
          (appointment) => appointment.status === AppointmentStatus.SCHEDULED,
        ).length,
        completed: appointments.filter(
          (appointment) => appointment.status === AppointmentStatus.COMPLETED,
        ).length,
        cancelled: appointments.filter(
          (appointment) => appointment.status === AppointmentStatus.CANCELLED,
        ).length,
      },
      goals: goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        metric: goal.metric,
        direction: goal.direction,
        targetValue: goal.targetValue,
        targetSecondaryValue: goal.targetSecondaryValue,
        unit: goal.unit,
        targetDate: goal.targetDate,
        latestProgress: goal.progress[0] ?? null,
      })),
      activeEmergency,
      unusualChanges,
      generatedAt: new Date(),
      disclaimer: REPORT_DISCLAIMER,
    };

    if (recordAudit) {
      await this.audit.record({
        userId: actorUserId,
        action: 'HEALTH_TREND_REPORT_ACCESSED',
        entity: 'Patient',
        entityId: patient.id,
        metadata: {
          patientId: patient.id,
          periodDays,
          count: unusualChanges.length,
        },
      });
    }
    return report;
  }

  private buildTrends(
    readings: TrendReading[],
    from: Date,
    to: Date,
    source: 'MEASUREMENT' | 'WEARABLE',
    unusualChanges: UnusualChange[],
  ) {
    const grouped = new Map<string, TrendReading[]>();
    for (const reading of readings) {
      const key = `${reading.type}:${reading.unit}`;
      const group = grouped.get(key) ?? [];
      group.push(reading);
      grouped.set(key, group);
    }

    return [...grouped.values()]
      .map((group) => {
        const current = group.filter(
          (reading) => reading.measuredAt >= from && reading.measuredAt <= to,
        );
        if (current.length === 0) return null;
        const previous = group.filter((reading) => reading.measuredAt < from);
        const currentAverage = this.average(current.map(({ value }) => value));
        const previousAverage =
          previous.length > 0
            ? this.average(previous.map(({ value }) => value))
            : null;
        const changePercent =
          previousAverage === null || previousAverage === 0
            ? null
            : ((currentAverage - previousAverage) / Math.abs(previousAverage)) *
              100;
        const threshold = this.unusualThreshold(group[0].type);
        const unusualChange =
          changePercent !== null && Math.abs(changePercent) >= threshold;
        const latest = current[current.length - 1];
        if (unusualChange && changePercent !== null) {
          const direction =
            changePercent >= 0
              ? ('INCREASED' as const)
              : ('DECREASED' as const);
          unusualChanges.push({
            source,
            metric: group[0].type,
            direction,
            changePercent: Math.abs(Math.round(changePercent * 10) / 10),
            observedAt: latest.measuredAt,
            description: `${group[0].type.replaceAll('_', ' ').toLowerCase()} ${direction.toLowerCase()} by ${Math.abs(changePercent).toFixed(1)}% compared with the preceding period. This is a descriptive flag, not a diagnosis.`,
          });
        }

        return {
          type: group[0].type,
          unit: group[0].unit,
          count: current.length,
          latest: latest.value,
          latestAt: latest.measuredAt,
          average: Math.round(currentAverage * 100) / 100,
          minimum: Math.min(...current.map(({ value }) => value)),
          maximum: Math.max(...current.map(({ value }) => value)),
          previousAverage:
            previousAverage === null
              ? null
              : Math.round(previousAverage * 100) / 100,
          changePercent:
            changePercent === null ? null : Math.round(changePercent * 10) / 10,
          direction:
            changePercent === null || Math.abs(changePercent) < 0.1
              ? 'STABLE'
              : changePercent > 0
                ? 'INCREASING'
                : 'DECREASING',
          unusualChange,
          series: this.dailySeries(current),
        };
      })
      .filter((trend) => trend !== null)
      .sort((first, second) => first.type.localeCompare(second.type));
  }

  private adherenceSummary(
    logs: Array<{
      status: MedicationLogStatus;
      scheduledFor: Date;
    }>,
    from: Date,
    to: Date,
  ) {
    const summarize = (rangeLogs: typeof logs) => {
      const taken = rangeLogs.filter(
        (log) => log.status === MedicationLogStatus.TAKEN,
      ).length;
      const missed = rangeLogs.filter(
        (log) => log.status === MedicationLogStatus.MISSED,
      ).length;
      const skipped = rangeLogs.filter(
        (log) => log.status === MedicationLogStatus.SKIPPED,
      ).length;
      const pending = rangeLogs.filter(
        (log) => log.status === MedicationLogStatus.PENDING,
      ).length;
      const eligible = taken + missed + skipped;
      return {
        scheduled: rangeLogs.length,
        taken,
        missed,
        skipped,
        pending,
        adherenceRate:
          eligible === 0 ? null : Math.round((taken / eligible) * 1_000) / 10,
      };
    };
    const current = summarize(
      logs.filter((log) => log.scheduledFor >= from && log.scheduledFor <= to),
    );
    const previous = summarize(logs.filter((log) => log.scheduledFor < from));
    return {
      ...current,
      previousAdherenceRate: previous.adherenceRate,
      changePercentagePoints:
        current.adherenceRate === null || previous.adherenceRate === null
          ? null
          : Math.round((current.adherenceRate - previous.adherenceRate) * 10) /
            10,
    };
  }

  private dailySeries(readings: TrendReading[]) {
    const days = new Map<string, number[]>();
    for (const reading of readings) {
      const date = reading.measuredAt.toISOString().slice(0, 10);
      const values = days.get(date) ?? [];
      values.push(reading.value);
      days.set(date, values);
    }
    return [...days.entries()].map(([date, values]) => ({
      date,
      average: Math.round(this.average(values) * 100) / 100,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      count: values.length,
    }));
  }

  private average(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private unusualThreshold(metric: string): number {
    if (metric === 'WEIGHT') return 5;
    if (metric === 'OXYGEN_SATURATION' || metric === 'BLOOD_OXYGEN') return 5;
    if (metric === 'BODY_TEMPERATURE' || metric === 'TEMPERATURE') return 3;
    if (metric === 'BLOOD_PRESSURE') return 15;
    return 20;
  }

  private period(days: number) {
    const to = new Date();
    return {
      days,
      from: new Date(to.getTime() - days * 86_400_000),
      to,
    };
  }
}
