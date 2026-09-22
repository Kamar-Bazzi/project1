import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import {
  canonicalizeIanaTimeZone,
  DEFAULT_TIME_ZONE,
} from '../common/validators/is-iana-time-zone.validator';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMedicationRefillDto } from './dto/update-medication-refill.dto';

@Injectable()
export class MedicationRefillsService {
  private readonly logger = new Logger(MedicationRefillsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async update(
    userId: string,
    medicationId: string,
    dto: UpdateMedicationRefillDto,
    requestedTimeZone?: string,
  ) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one refill field is required');
    }
    const patient = await this.access.getPatientForUser(userId);
    const timeZone = this.resolveTimeZone(patient.timeZone, requestedTimeZone);
    const nextRefillDate = this.parseDate(dto.nextRefillDate);
    const medication = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.medication.findFirst({
        where: { id: medicationId, patientId: patient.id },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Medication not found');
      const updated = await transaction.medication.update({
        where: { id: existing.id },
        data: {
          remainingQuantity: dto.remainingQuantity,
          quantityUnit: dto.quantityUnit,
          lowQuantityThreshold: dto.lowQuantityThreshold,
          nextRefillDate,
          pharmacyName: dto.pharmacyName,
        },
        include: {
          schedules: { orderBy: { scheduledTime: 'asc' } },
          logs: { orderBy: { scheduledFor: 'desc' }, take: 30 },
        },
      });
      await this.audit.record(
        {
          userId,
          action: 'MEDICATION_REFILL_UPDATED',
          entity: 'Medication',
          entityId: updated.id,
          metadata: { patientId: patient.id, medicationId: updated.id },
        },
        transaction,
      );
      return updated;
    });

    const response = this.withRefillStatus({
      ...medication,
      timeZone,
    });
    if (response.refillStatus === 'LOW') {
      try {
        await this.notifications.notifyMedicationRefillLow(
          medication.id,
          timeZone,
        );
      } catch (error) {
        const code =
          error instanceof Error ? error.constructor.name : 'UnknownError';
        this.logger.warn(
          `Medication refill was saved but its notification failed (${code})`,
        );
      }
    }
    return response;
  }

  private parseDate(value: string | null | undefined): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(
        'nextRefillDate must be a valid date in YYYY-MM-DD format',
      );
    }
    return parsed;
  }

  private resolveTimeZone(
    storedTimeZone: string | null | undefined,
    requestedTimeZone: string | undefined,
  ): string {
    const canonicalRequested =
      requestedTimeZone === undefined
        ? null
        : canonicalizeIanaTimeZone(requestedTimeZone);
    if (requestedTimeZone !== undefined && canonicalRequested === null) {
      throw new BadRequestException(
        'X-Time-Zone must be a valid IANA time zone',
      );
    }
    return (
      canonicalizeIanaTimeZone(storedTimeZone) ??
      canonicalRequested ??
      DEFAULT_TIME_ZONE
    );
  }

  private withRefillStatus<
    T extends {
      remainingQuantity: number | null;
      lowQuantityThreshold: number | null;
      name: string;
    },
  >(medication: T) {
    if (
      medication.remainingQuantity === null ||
      medication.lowQuantityThreshold === null
    ) {
      return {
        ...medication,
        refillStatus: 'NOT_TRACKED' as const,
        lowSupplyWarning: null,
      };
    }
    const low = medication.remainingQuantity <= medication.lowQuantityThreshold;
    return {
      ...medication,
      refillStatus: low ? ('LOW' as const) : ('OK' as const),
      lowSupplyWarning: low
        ? `${medication.name} is at or below the saved low-supply threshold. Review refill needs with the pharmacy or care team.`
        : null,
    };
  }
}
