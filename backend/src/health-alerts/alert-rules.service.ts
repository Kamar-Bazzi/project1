import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertRule, Prisma } from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAlertRuleDto,
  MAX_ALERT_THRESHOLD,
  MIN_ALERT_THRESHOLD,
} from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class AlertRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HealthAuditService,
  ) {}

  async findAllForPatient(userId: string): Promise<AlertRule[]> {
    const patientId = await this.getPatientId(userId);
    const rules = await this.prisma.alertRule.findMany({
      where: { patientId },
      orderBy: [{ metricType: 'asc' }, { createdAt: 'asc' }],
    });

    await this.audit.record({
      userId,
      action: 'ALERT_RULE_LIST_ACCESSED',
      entity: 'AlertRule',
      metadata: { patientId, count: rules.length },
    });

    return rules;
  }

  async findOneForPatient(userId: string, ruleId: string): Promise<AlertRule> {
    const patientId = await this.getPatientId(userId);
    const rule = await this.prisma.alertRule.findFirst({
      where: { id: ruleId, patientId },
    });

    if (!rule) {
      throw new NotFoundException('Alert rule not found');
    }

    await this.audit.record({
      userId,
      action: 'ALERT_RULE_ACCESSED',
      entity: 'AlertRule',
      entityId: rule.id,
      metadata: { patientId, metricType: rule.metricType },
    });

    return rule;
  }

  async createForPatient(
    userId: string,
    createDto: CreateAlertRuleDto,
  ): Promise<AlertRule> {
    const patientId = await this.getPatientId(userId);
    this.assertValidThresholds(
      createDto.minimumValue ?? null,
      createDto.maximumValue ?? null,
    );
    this.assertValidConsecutiveReadings(
      createDto.consecutiveReadingsRequired ?? 3,
    );

    try {
      return await this.runSerializableTransaction(async (transaction) => {
        const rule = await transaction.alertRule.create({
          data: {
            patientId,
            metricType: createDto.metricType,
            minimumValue: createDto.minimumValue ?? null,
            maximumValue: createDto.maximumValue ?? null,
            enabled: createDto.enabled,
            consecutiveReadingsRequired: createDto.consecutiveReadingsRequired,
            severity: createDto.severity,
            notifyEmergencyContacts: createDto.notifyEmergencyContacts,
          },
        });

        await this.audit.record(
          {
            userId,
            action: 'ALERT_RULE_CREATED',
            entity: 'AlertRule',
            entityId: rule.id,
            metadata: {
              patientId,
              metricType: rule.metricType,
              enabled: rule.enabled,
              severity: rule.severity,
            },
          },
          transaction,
        );

        return rule;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An alert rule already exists for this metric type',
        );
      }

      throw error;
    }
  }

  async updateForPatient(
    userId: string,
    ruleId: string,
    updateDto: UpdateAlertRuleDto,
  ): Promise<AlertRule> {
    const patientId = await this.getPatientId(userId);

    return this.runSerializableTransaction(async (transaction) => {
      const existing = await transaction.alertRule.findFirst({
        where: { id: ruleId, patientId },
      });

      if (!existing) {
        throw new NotFoundException('Alert rule not found');
      }

      const minimumValue =
        updateDto.minimumValue === undefined
          ? existing.minimumValue
          : updateDto.minimumValue;
      const maximumValue =
        updateDto.maximumValue === undefined
          ? existing.maximumValue
          : updateDto.maximumValue;

      this.assertValidThresholds(minimumValue, maximumValue);
      this.assertValidConsecutiveReadings(
        updateDto.consecutiveReadingsRequired ??
          existing.consecutiveReadingsRequired,
      );

      const data: Prisma.AlertRuleUpdateInput = {};

      if (updateDto.minimumValue !== undefined) {
        data.minimumValue = updateDto.minimumValue;
      }
      if (updateDto.maximumValue !== undefined) {
        data.maximumValue = updateDto.maximumValue;
      }
      if (updateDto.enabled !== undefined) {
        data.enabled = updateDto.enabled;
      }
      if (updateDto.consecutiveReadingsRequired !== undefined) {
        data.consecutiveReadingsRequired =
          updateDto.consecutiveReadingsRequired;
      }
      if (updateDto.severity !== undefined) {
        data.severity = updateDto.severity;
      }
      if (updateDto.notifyEmergencyContacts !== undefined) {
        data.notifyEmergencyContacts = updateDto.notifyEmergencyContacts;
      }

      const rule =
        Object.keys(data).length === 0
          ? existing
          : await transaction.alertRule.update({
              where: { id: existing.id, patientId },
              data,
            });

      await this.audit.record(
        {
          userId,
          action: 'ALERT_RULE_UPDATED',
          entity: 'AlertRule',
          entityId: rule.id,
          metadata: {
            patientId,
            metricType: rule.metricType,
            enabled: rule.enabled,
            severity: rule.severity,
          },
        },
        transaction,
      );

      return rule;
    });
  }

  async deleteForPatient(userId: string, ruleId: string): Promise<void> {
    const patientId = await this.getPatientId(userId);

    await this.runSerializableTransaction(async (transaction) => {
      const result = await transaction.alertRule.deleteMany({
        where: { id: ruleId, patientId },
      });

      if (result.count === 0) {
        throw new NotFoundException('Alert rule not found');
      }

      await this.audit.record(
        {
          userId,
          action: 'ALERT_RULE_DELETED',
          entity: 'AlertRule',
          entityId: ruleId,
          metadata: { patientId },
        },
        transaction,
      );
    });
  }

  private assertValidThresholds(
    minimumValue: number | null,
    maximumValue: number | null,
  ): void {
    if (
      (minimumValue !== null &&
        (!Number.isFinite(minimumValue) ||
          minimumValue < MIN_ALERT_THRESHOLD ||
          minimumValue > MAX_ALERT_THRESHOLD)) ||
      (maximumValue !== null &&
        (!Number.isFinite(maximumValue) ||
          maximumValue < MIN_ALERT_THRESHOLD ||
          maximumValue > MAX_ALERT_THRESHOLD))
    ) {
      throw new BadRequestException('Alert thresholds must be finite numbers');
    }

    if (minimumValue === null && maximumValue === null) {
      throw new BadRequestException(
        'At least one of minimumValue or maximumValue is required',
      );
    }

    if (
      minimumValue !== null &&
      maximumValue !== null &&
      minimumValue >= maximumValue
    ) {
      throw new BadRequestException(
        'minimumValue must be less than maximumValue',
      );
    }
  }

  private assertValidConsecutiveReadings(value: number): void {
    if (!Number.isInteger(value) || value < 2 || value > 100) {
      throw new BadRequestException(
        'consecutiveReadingsRequired must be an integer between 2 and 100',
      );
    }
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

    throw new Error('Serializable alert rule transaction retry exhausted');
  }
}
