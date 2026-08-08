import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HealthAlert,
  HealthAlertStatus,
  HealthMetricType,
  Prisma,
} from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthAlertQueryDto } from './dto/health-alert-query.dto';

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class HealthAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HealthAuditService,
  ) {}

  async findAllForPatient(
    userId: string,
    query: HealthAlertQueryDto,
  ): Promise<HealthAlert[]> {
    const patientId = await this.getPatientId(userId);
    const alerts = await this.prisma.healthAlert.findMany({
      where: {
        patientId,
        status: query.status,
        metricType: query.metricType,
      },
      orderBy: [{ detectedAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit,
    });

    await this.audit.record({
      userId,
      action: 'HEALTH_ALERT_LIST_ACCESSED',
      entity: 'HealthAlert',
      metadata: {
        patientId,
        status: query.status ?? null,
        metricType: query.metricType ?? null,
        limit: query.limit,
        count: alerts.length,
      },
    });

    return alerts;
  }

  async findOneForPatient(
    userId: string,
    alertId: string,
  ): Promise<HealthAlert> {
    const patientId = await this.getPatientId(userId);
    const alert = await this.prisma.healthAlert.findFirst({
      where: {
        id: alertId,
        patientId,
      },
    });

    if (!alert) {
      throw new NotFoundException('Health alert not found');
    }

    await this.audit.record({
      userId,
      action: 'HEALTH_ALERT_ACCESSED',
      entity: 'HealthAlert',
      entityId: alert.id,
      metadata: { patientId, metricType: alert.metricType },
    });

    return alert;
  }

  acknowledgeForPatient(userId: string, alertId: string): Promise<HealthAlert> {
    return this.updateStatusForPatient(
      userId,
      alertId,
      HealthAlertStatus.ACKNOWLEDGED,
    );
  }

  resolveForPatient(userId: string, alertId: string): Promise<HealthAlert> {
    return this.updateStatusForPatient(
      userId,
      alertId,
      HealthAlertStatus.RESOLVED,
    );
  }

  private async updateStatusForPatient(
    userId: string,
    alertId: string,
    targetStatus: HealthAlertStatus,
  ): Promise<HealthAlert> {
    const patientId = await this.getPatientId(userId);

    return this.runSerializableTransaction(async (transaction) => {
      const existing = await transaction.healthAlert.findFirst({
        where: {
          id: alertId,
          patientId,
        },
      });

      if (!existing) {
        throw new NotFoundException('Health alert not found');
      }

      if (
        targetStatus === HealthAlertStatus.ACKNOWLEDGED &&
        existing.status === HealthAlertStatus.RESOLVED
      ) {
        throw new BadRequestException(
          'A resolved health alert cannot be acknowledged',
        );
      }

      if (existing.status === targetStatus) {
        return existing;
      }

      const now = new Date();
      const alert = await transaction.healthAlert.update({
        where: {
          id: existing.id,
          patientId,
        },
        data:
          targetStatus === HealthAlertStatus.ACKNOWLEDGED
            ? {
                status: targetStatus,
                acknowledgedAt: now,
                resolvedAt: null,
              }
            : {
                status: targetStatus,
                resolvedAt: now,
              },
      });

      await this.audit.record(
        {
          userId,
          action:
            targetStatus === HealthAlertStatus.ACKNOWLEDGED
              ? 'HEALTH_ALERT_ACKNOWLEDGED'
              : 'HEALTH_ALERT_RESOLVED',
          entity: 'HealthAlert',
          entityId: alert.id,
          metadata: {
            patientId,
            metricType: alert.metricType,
            status: alert.status,
          },
        },
        transaction,
      );

      return alert;
    });
  }

  private async getPatientId(userId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    return patient.id;
  }

  private async runSerializableTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const canRetry =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS;

        if (!canRetry) {
          throw error;
        }
      }
    }

    throw new Error('Serializable health alert transaction retry exhausted');
  }
}

export interface HealthAlertFilters {
  status?: HealthAlertStatus;
  metricType?: HealthMetricType;
  limit?: number;
}
