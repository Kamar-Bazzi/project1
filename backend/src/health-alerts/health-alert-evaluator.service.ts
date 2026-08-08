import { Injectable } from '@nestjs/common';
import {
  AlertRule,
  HealthAlert,
  HealthAlertStatus,
  HealthMetric,
  Prisma,
} from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type EvaluationDatabaseClient = Pick<
  Prisma.TransactionClient,
  'alertRule' | 'healthMetric' | 'healthAlert'
>;

@Injectable()
export class HealthAlertEvaluatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: HealthAuditService,
  ) {}

  async evaluateMetric(
    metric: HealthMetric,
    transaction?: Prisma.TransactionClient,
  ): Promise<HealthAlert | null> {
    const database: EvaluationDatabaseClient = transaction ?? this.prisma;
    const rule = await database.alertRule.findUnique({
      where: {
        patientId_metricType: {
          patientId: metric.patientId,
          metricType: metric.metricType,
        },
      },
    });

    if (!rule?.enabled || !this.isOutsideConfiguredRange(metric.value, rule)) {
      return null;
    }

    // A delayed provider backfill must not create a new active alert when a
    // newer reading already supersedes it. Batch ingestion inserts first and
    // evaluates chronologically, so only the newest row for a metric type
    // proceeds and can consider its immediately preceding readings.
    const newestReading = await database.healthMetric.findFirst({
      where: {
        patientId: metric.patientId,
        metricType: metric.metricType,
      },
      select: { id: true },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });

    if (newestReading?.id !== metric.id) {
      return null;
    }

    const priorReadings = await database.healthMetric.findMany({
      where: {
        patientId: metric.patientId,
        metricType: metric.metricType,
        measuredAt: { lte: metric.measuredAt },
        NOT: { id: metric.id },
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: rule.consecutiveReadingsRequired - 1,
    });
    const consecutiveReadings = [metric, ...priorReadings];

    if (
      consecutiveReadings.length < rule.consecutiveReadingsRequired ||
      !consecutiveReadings.every((reading) =>
        this.isOutsideConfiguredRange(reading.value, rule),
      )
    ) {
      return null;
    }

    const existingOpenAlert = await database.healthAlert.findFirst({
      where: {
        patientId: metric.patientId,
        alertRuleId: rule.id,
        status: {
          in: [HealthAlertStatus.ACTIVE, HealthAlertStatus.ACKNOWLEDGED],
        },
      },
      orderBy: { detectedAt: 'desc' },
    });

    if (existingOpenAlert) {
      return null;
    }

    const alert = await database.healthAlert.create({
      data: {
        patientId: metric.patientId,
        metricType: metric.metricType,
        severity: rule.severity,
        message: this.buildSafeAlertMessage(metric.metricType),
        metricId: metric.id,
        alertRuleId: rule.id,
      },
    });

    const notificationResults = await this.notifications.notifyHealthAlert(
      alert,
      rule,
      transaction,
    );
    const emergencyContactResult = notificationResults.find(
      ({ channel }) => channel === 'EMERGENCY_CONTACT',
    );

    await this.audit.record(
      {
        action: 'HEALTH_ALERT_DETECTED',
        entity: 'HealthAlert',
        entityId: alert.id,
        metadata: {
          patientId: metric.patientId,
          metricType: metric.metricType,
          severity: rule.severity,
          notificationChannel: 'IN_APP',
          notificationOutcome: 'DELIVERED',
          contactCount: emergencyContactResult?.recipientCount ?? 0,
        },
      },
      transaction,
    );

    return alert;
  }

  async evaluateMetrics(
    metrics: HealthMetric[],
    transaction?: Prisma.TransactionClient,
  ): Promise<HealthAlert[]> {
    const chronologicalMetrics = [...metrics].sort((left, right) => {
      const measuredDifference =
        left.measuredAt.getTime() - right.measuredAt.getTime();

      if (measuredDifference !== 0) {
        return measuredDifference;
      }

      const createdDifference =
        left.createdAt.getTime() - right.createdAt.getTime();

      return createdDifference !== 0
        ? createdDifference
        : left.id.localeCompare(right.id);
    });
    const alerts: HealthAlert[] = [];

    for (const metric of chronologicalMetrics) {
      const alert = await this.evaluateMetric(metric, transaction);

      if (alert) {
        alerts.push(alert);
      }
    }

    return alerts;
  }

  private isOutsideConfiguredRange(value: number, rule: AlertRule): boolean {
    return (
      (rule.minimumValue !== null && value < rule.minimumValue) ||
      (rule.maximumValue !== null && value > rule.maximumValue)
    );
  }

  private buildSafeAlertMessage(
    metricType: HealthMetric['metricType'],
  ): string {
    const label = metricType.toLowerCase().replaceAll('_', ' ');

    return `Your ${label} readings are outside your configured range. Recheck the reading and seek appropriate attention if it remains unusual.`;
  }
}
