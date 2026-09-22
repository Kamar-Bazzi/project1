import { Injectable } from '@nestjs/common';
import {
  HealthAlertSeverity,
  HealthAlertStatus,
  HealthMetricType,
  MedicationLogStatus,
} from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import {
  getLocalDateUtcRange,
  getLocalDayUtcRange,
} from '../common/time-zone/local-day';
import { PrismaService } from '../prisma/prisma.service';

const PERIOD_DAYS = 7;
const DISCLAIMER =
  'This wellness score is a simple summary of recorded data and tracking activity. It is not a diagnosis, does not assess whether a measurement is medically safe, and must not be used to change treatment. Review concerns with a qualified clinician.';

export type ComponentStatus = 'ON_TRACK' | 'REVIEW' | 'NEEDS_DATA';
export type ComponentKey =
  | 'MEDICATION_ADHERENCE'
  | 'ACTIVITY'
  | 'SLEEP'
  | 'HEART_RATE'
  | 'MEASUREMENTS'
  | 'ALERTS';

export interface WellnessComponent {
  key: ComponentKey;
  score: number | null;
  status: ComponentStatus;
  value: number | null;
  unit: string | null;
  dataPoints: number;
  scoringBasis: string;
  summary: string;
}

export interface WellnessSummary {
  generatedAt: Date;
  period: { days: number; from: Date; to: Date };
  overall: {
    score: number | null;
    status: ComponentStatus;
    availableComponents: number;
    totalComponents: number;
  };
  components: WellnessComponent[];
  disclaimer: string;
}

@Injectable()
export class WellnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
  ) {}

  async summary(userId: string, now = new Date()): Promise<WellnessSummary> {
    const patient = await this.access.getPatientForUser(userId);
    const currentLocalDay = getLocalDayUtcRange(now, patient.timeZone);
    const firstDateKey = this.addCalendarDays(
      currentLocalDay.dateKey,
      1 - PERIOD_DAYS,
    );
    const from = getLocalDateUtcRange(
      firstDateKey,
      currentLocalDay.timeZone,
    ).start;
    const [logs, metrics, measurements, activeAlerts] = await Promise.all([
      this.prisma.medicationLog.findMany({
        where: {
          medication: { patientId: patient.id },
          scheduledFor: { gte: from, lte: now },
        },
        select: { status: true, scheduledFor: true },
      }),
      this.prisma.healthMetric.findMany({
        where: {
          patientId: patient.id,
          measuredAt: { gte: from, lte: now },
          metricType: {
            in: [
              HealthMetricType.STEPS,
              HealthMetricType.SLEEP_DURATION,
              HealthMetricType.HEART_RATE,
              HealthMetricType.RESTING_HEART_RATE,
            ],
          },
        },
        select: { metricType: true, value: true, measuredAt: true },
      }),
      this.prisma.measurement.findMany({
        where: { patientId: patient.id, measuredAt: { gte: from, lte: now } },
        select: { id: true, measuredAt: true },
      }),
      this.prisma.healthAlert.findMany({
        where: { patientId: patient.id, status: HealthAlertStatus.ACTIVE },
        select: { severity: true, metricType: true },
      }),
    ]);

    const components: WellnessComponent[] = [
      this.medicationComponent(logs),
      this.activityComponent(metrics, patient.timeZone),
      this.sleepComponent(metrics, patient.timeZone),
      this.heartRateComponent(metrics, activeAlerts),
      this.measurementComponent(measurements),
      this.alertComponent(activeAlerts),
    ];
    const scored = components.filter(
      (component): component is WellnessComponent & { score: number } =>
        component.score !== null && component.key !== 'ALERTS',
    );
    const available = components.filter(
      (component) => component.score !== null,
    );
    const score =
      scored.length === 0
        ? null
        : Math.round(
            scored.reduce((sum, component) => sum + component.score, 0) /
              scored.length,
          );
    const status: ComponentStatus =
      score === null ? 'NEEDS_DATA' : score >= 75 ? 'ON_TRACK' : 'REVIEW';

    await this.audit.record({
      userId,
      action: 'WELLNESS_SUMMARY_ACCESSED',
      entity: 'Patient',
      entityId: patient.id,
      metadata: {
        patientId: patient.id,
        periodDays: PERIOD_DAYS,
        count: available.length,
      },
    });

    return {
      generatedAt: now,
      period: { days: PERIOD_DAYS, from, to: now },
      overall: {
        score,
        status,
        availableComponents: available.length,
        totalComponents: components.length,
      },
      components,
      disclaimer: DISCLAIMER,
    };
  }

  private medicationComponent(
    logs: Array<{ status: MedicationLogStatus; scheduledFor: Date }>,
  ): WellnessComponent {
    const eligible = logs.filter(
      (log) =>
        log.status === MedicationLogStatus.TAKEN ||
        log.status === MedicationLogStatus.MISSED ||
        log.status === MedicationLogStatus.SKIPPED,
    );
    if (eligible.length === 0) {
      return this.missing(
        'MEDICATION_ADHERENCE',
        'No completed scheduled-dose records were available for this period.',
        'Taken doses divided by taken, missed, and skipped recorded doses.',
      );
    }
    const taken = eligible.filter(
      (log) => log.status === MedicationLogStatus.TAKEN,
    ).length;
    const rate = Math.round((taken / eligible.length) * 100);
    return {
      key: 'MEDICATION_ADHERENCE',
      score: rate,
      status: rate >= 80 ? 'ON_TRACK' : 'REVIEW',
      value: rate,
      unit: '%',
      dataPoints: eligible.length,
      scoringBasis:
        'Taken doses divided by taken, missed, and skipped recorded doses; pending doses are excluded.',
      summary: `${taken} of ${eligible.length} completed dose records were marked taken.`,
    };
  }

  private activityComponent(
    metrics: Array<{
      metricType: HealthMetricType;
      value: number;
      measuredAt: Date;
    }>,
    timeZone: string | null,
  ): WellnessComponent {
    const steps = metrics.filter(
      (metric) => metric.metricType === HealthMetricType.STEPS,
    );
    if (steps.length === 0) {
      return this.missing(
        'ACTIVITY',
        'No step records were available for this period.',
        'Recording coverage across the seven-day period; this does not judge an activity target.',
      );
    }
    const days = this.recordedDayCount(steps, timeZone);
    const score = Math.min(100, Math.round((days / PERIOD_DAYS) * 100));
    const dailySteps = new Map<string, number>();
    for (const metric of steps) {
      const dateKey = getLocalDayUtcRange(metric.measuredAt, timeZone).dateKey;
      dailySteps.set(
        dateKey,
        Math.max(dailySteps.get(dateKey) ?? 0, metric.value),
      );
    }
    const average = Math.round(
      [...dailySteps.values()].reduce((sum, value) => sum + value, 0) / days,
    );
    return {
      key: 'ACTIVITY',
      score,
      status: score >= 50 ? 'ON_TRACK' : 'REVIEW',
      value: average,
      unit: 'steps/recorded day',
      dataPoints: steps.length,
      scoringBasis:
        'Score is the percentage of days with step data, not a medical activity target.',
      summary: `Step data was recorded on ${days} of ${PERIOD_DAYS} days.`,
    };
  }

  private sleepComponent(
    metrics: Array<{
      metricType: HealthMetricType;
      value: number;
      measuredAt: Date;
    }>,
    timeZone: string | null,
  ): WellnessComponent {
    const sleep = metrics.filter(
      (metric) => metric.metricType === HealthMetricType.SLEEP_DURATION,
    );
    if (sleep.length === 0) {
      return this.missing(
        'SLEEP',
        'No sleep-duration records were available for this period.',
        'Recording coverage across the seven-day period; recorded duration is not clinically interpreted.',
      );
    }
    const days = this.recordedDayCount(sleep, timeZone);
    const score = Math.min(100, Math.round((days / PERIOD_DAYS) * 100));
    const averageHours =
      Math.round(
        (sleep.reduce((sum, metric) => sum + metric.value, 0) /
          sleep.length /
          60) *
          10,
      ) / 10;
    return {
      key: 'SLEEP',
      score,
      status: score >= 50 ? 'ON_TRACK' : 'REVIEW',
      value: averageHours,
      unit: 'hours/record',
      dataPoints: sleep.length,
      scoringBasis:
        'Score is the percentage of days with sleep data; duration is displayed without medical interpretation.',
      summary: `Sleep data was recorded on ${days} of ${PERIOD_DAYS} days.`,
    };
  }

  private heartRateComponent(
    metrics: Array<{
      metricType: HealthMetricType;
      value: number;
      measuredAt: Date;
    }>,
    alerts: Array<{
      severity: HealthAlertSeverity;
      metricType: HealthMetricType;
    }>,
  ): WellnessComponent {
    const readings = metrics.filter(
      (metric) =>
        metric.metricType === HealthMetricType.HEART_RATE ||
        metric.metricType === HealthMetricType.RESTING_HEART_RATE,
    );
    if (readings.length === 0) {
      return this.missing(
        'HEART_RATE',
        'No heart-rate records were available for this period.',
        'Presence of recorded heart-rate data and existing patient-configured alerts; values are not clinically interpreted.',
      );
    }
    const relevantAlerts = alerts.filter(
      (alert) =>
        alert.metricType === HealthMetricType.HEART_RATE ||
        alert.metricType === HealthMetricType.RESTING_HEART_RATE,
    );
    const score = this.alertAdjustedScore(relevantAlerts);
    const latest = [...readings].sort(
      (first, second) =>
        second.measuredAt.getTime() - first.measuredAt.getTime(),
    )[0];
    return {
      key: 'HEART_RATE',
      score,
      status: relevantAlerts.length > 0 ? 'REVIEW' : 'ON_TRACK',
      value: latest.value,
      unit: 'bpm',
      dataPoints: readings.length,
      scoringBasis:
        'Recorded values are not range-scored. The indicator changes only when an existing configured heart-rate alert is active.',
      summary:
        relevantAlerts.length === 0
          ? 'Heart-rate data is available with no active configured heart-rate alert.'
          : `${relevantAlerts.length} configured heart-rate alert(s) are active for review.`,
    };
  }

  private measurementComponent(
    measurements: Array<{ id: string; measuredAt: Date }>,
  ): WellnessComponent {
    if (measurements.length === 0) {
      return this.missing(
        'MEASUREMENTS',
        'No manual measurements were recorded during this period.',
        'Presence of recent manual measurements; measurement values are not clinically interpreted.',
      );
    }
    return {
      key: 'MEASUREMENTS',
      score: 100,
      status: 'ON_TRACK',
      value: measurements.length,
      unit: 'records',
      dataPoints: measurements.length,
      scoringBasis:
        'This component reports recent recording activity only and does not assess the values.',
      summary: `${measurements.length} manual measurement record(s) were added in the period.`,
    };
  }

  private alertComponent(
    alerts: Array<{
      severity: HealthAlertSeverity;
      metricType: HealthMetricType;
    }>,
  ): WellnessComponent {
    const score = alerts.length === 0 ? null : this.alertAdjustedScore(alerts);
    const requiresReview = alerts.some(
      (alert) =>
        alert.severity === HealthAlertSeverity.WARNING ||
        alert.severity === HealthAlertSeverity.URGENT,
    );
    return {
      key: 'ALERTS',
      score,
      status: requiresReview ? 'REVIEW' : 'ON_TRACK',
      value: alerts.length,
      unit: 'active alerts',
      dataPoints: alerts.length,
      scoringBasis:
        'No active alerts is shown as informational and is not scored. Active configured alerts are displayed as 70 for information, 50 for warning, or 25 for urgent; this alert value is not included in the overall average.',
      summary:
        alerts.length === 0
          ? 'There are no active configured health alerts.'
          : `${alerts.length} configured health alert(s) are active for review.`,
    };
  }

  private alertAdjustedScore(
    alerts: Array<{ severity: HealthAlertSeverity }>,
  ): number {
    if (alerts.some((alert) => alert.severity === HealthAlertSeverity.URGENT)) {
      return 25;
    }
    if (
      alerts.some((alert) => alert.severity === HealthAlertSeverity.WARNING)
    ) {
      return 50;
    }
    return alerts.length > 0 ? 70 : 100;
  }

  private recordedDayCount(
    records: Array<{ measuredAt: Date }>,
    timeZone: string | null,
  ): number {
    return new Set(
      records.map(
        ({ measuredAt }) => getLocalDayUtcRange(measuredAt, timeZone).dateKey,
      ),
    ).size;
  }

  private missing(
    key: ComponentKey,
    summary: string,
    scoringBasis: string,
  ): WellnessComponent {
    return {
      key,
      score: null,
      status: 'NEEDS_DATA',
      value: null,
      unit: null,
      dataPoints: 0,
      scoringBasis,
      summary,
    };
  }

  private addCalendarDays(dateKey: string, days: number): string {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days))
      .toISOString()
      .slice(0, 10);
  }
}
