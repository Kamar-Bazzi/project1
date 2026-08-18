import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

type AuditMetadataValue = string | number | boolean | null;

export interface HealthAuditEvent {
  userId?: string;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, AuditMetadataValue>;
}

type AuditDatabaseClient = Pick<Prisma.TransactionClient, 'auditLog'>;

const ALLOWED_METADATA_KEYS = new Set([
  'patientId',
  'doctorId',
  'appointmentId',
  'goalId',
  'progressId',
  'emergencyEventId',
  'metricType',
  'noteCategory',
  'goalMetric',
  'goalStatus',
  'status',
  'count',
  'resultCount',
  'receivedCount',
  'createdCount',
  'duplicateCount',
  'limit',
  'from',
  'to',
  'hasFrom',
  'hasTo',
  'source',
  'provider',
  'operation',
  'notificationChannel',
  'notificationOutcome',
  'contactCount',
  'enabled',
  'severity',
  'periodDays',
  'dataset',
  'format',
  'timelineTypes',
]);

/**
 * Writes deliberately sparse audit records for sensitive health operations.
 * Reading values, free-form metadata and contact details are never accepted.
 */
@Injectable()
export class HealthAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    event: HealthAuditEvent,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    const database: AuditDatabaseClient = transaction ?? this.prisma;
    const metadata = this.sanitizeMetadata(event.metadata);

    await database.auditLog.create({
      data: {
        userId: event.userId,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
        metadata:
          Object.keys(metadata).length > 0
            ? (metadata as Prisma.InputJsonObject)
            : undefined,
      },
    });
  }

  private sanitizeMetadata(
    metadata: Record<string, AuditMetadataValue> | undefined,
  ): Record<string, AuditMetadataValue> {
    if (!metadata) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(metadata).filter(
        ([key, value]) =>
          ALLOWED_METADATA_KEYS.has(key) &&
          (value === null ||
            typeof value === 'string' ||
            (typeof value === 'number' && Number.isFinite(value)) ||
            typeof value === 'boolean'),
      ),
    );
  }
}
