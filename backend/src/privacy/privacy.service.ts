import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AccountDeletionStatus,
  PatientDataExportDataset as DatabaseExportDataset,
  PatientDataExportFormat as DatabaseExportFormat,
  PatientDataExportRequestStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancelAccountDeletionDto,
  PatientExportDataset,
  PatientExportFormat,
  RequestAccountDeletionDto,
  RequestPatientDataExportDto,
} from './dto/privacy.dto';
import {
  PatientExportDocument,
  PatientExportRow,
  RenderedPatientExport,
  renderPatientExport,
} from './patient-data-export.renderer';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;
const DEFAULT_DELETION_GRACE_DAYS = 30;
const DEFAULT_EXPORT_EXPIRY_HOURS = 24;
const DEFAULT_MAX_EXPORT_RECORDS = 50_000;
const STALE_PROCESSING_MILLISECONDS = 15 * 60 * 1_000;

const databaseFormat: Record<PatientExportFormat, DatabaseExportFormat> = {
  [PatientExportFormat.CSV]: DatabaseExportFormat.CSV,
  [PatientExportFormat.JSON]: DatabaseExportFormat.JSON,
  [PatientExportFormat.PDF]: DatabaseExportFormat.PDF,
};

const databaseDataset: Record<PatientExportDataset, DatabaseExportDataset> = {
  [PatientExportDataset.ALL]: DatabaseExportDataset.ALL,
  [PatientExportDataset.MEDICATIONS]: DatabaseExportDataset.MEDICATIONS,
  [PatientExportDataset.MEASUREMENTS]: DatabaseExportDataset.MEASUREMENTS,
  [PatientExportDataset.APPOINTMENTS]: DatabaseExportDataset.APPOINTMENTS,
  [PatientExportDataset.WEARABLE_DATA]: DatabaseExportDataset.WEARABLE_DATA,
  [PatientExportDataset.ALERTS]: DatabaseExportDataset.ALERTS,
};

const apiFormat: Record<DatabaseExportFormat, PatientExportFormat> = {
  [DatabaseExportFormat.CSV]: PatientExportFormat.CSV,
  [DatabaseExportFormat.JSON]: PatientExportFormat.JSON,
  [DatabaseExportFormat.PDF]: PatientExportFormat.PDF,
};

const apiDataset: Record<DatabaseExportDataset, PatientExportDataset> = {
  [DatabaseExportDataset.ALL]: PatientExportDataset.ALL,
  [DatabaseExportDataset.MEDICATIONS]: PatientExportDataset.MEDICATIONS,
  [DatabaseExportDataset.MEASUREMENTS]: PatientExportDataset.MEASUREMENTS,
  [DatabaseExportDataset.APPOINTMENTS]: PatientExportDataset.APPOINTMENTS,
  [DatabaseExportDataset.WEARABLE_DATA]: PatientExportDataset.WEARABLE_DATA,
  [DatabaseExportDataset.ALERTS]: PatientExportDataset.ALERTS,
};

interface ExportRange {
  from: Date | null;
  to: Date | null;
}

export interface PatientDataExportFile extends RenderedPatientExport {
  filename: string;
}

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);
  private readonly deletionGraceDays: number;
  private readonly exportExpiryHours: number;
  private readonly maxExportRecords: number;
  private deletionProcessorRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HealthAuditService,
    private readonly documents: DocumentsService,
    config: ConfigService,
  ) {
    this.deletionGraceDays = this.configuredInteger(
      config,
      'ACCOUNT_DELETION_GRACE_DAYS',
      DEFAULT_DELETION_GRACE_DAYS,
      1,
      90,
    );
    this.exportExpiryHours = this.configuredInteger(
      config,
      'PATIENT_DATA_EXPORT_EXPIRY_HOURS',
      DEFAULT_EXPORT_EXPIRY_HOURS,
      1,
      168,
    );
    this.maxExportRecords = this.configuredInteger(
      config,
      'PATIENT_DATA_EXPORT_MAX_RECORDS',
      DEFAULT_MAX_EXPORT_RECORDS,
      1_000,
      250_000,
    );
  }

  async getAccountDeletionStatus(userId: string) {
    await this.assertPatientUser(userId);
    const request = await this.prisma.accountDeletionRequest.findUnique({
      where: { userId },
    });
    return request
      ? this.toDeletionResponse(request)
      : {
          status: 'NONE' as const,
          requestId: null,
          requestedAt: null,
          scheduledFor: null,
          cancelledAt: null,
          completedAt: null,
        };
  }

  async requestAccountDeletion(userId: string, dto: RequestAccountDeletionDto) {
    const verified = await this.verifyPatientPassword(
      userId,
      dto.currentPassword,
    );
    const now = new Date();
    const scheduledFor = new Date(
      now.getTime() + this.deletionGraceDays * MILLISECONDS_PER_DAY,
    );

    return this.prisma.$transaction(async (transaction) => {
      await this.assertPasswordHasNotChanged(transaction, verified);
      const existing = await transaction.accountDeletionRequest.findUnique({
        where: { userId },
      });
      if (existing?.status === AccountDeletionStatus.PROCESSING) {
        throw new ConflictException('Account deletion is already processing');
      }
      if (existing?.status === AccountDeletionStatus.PENDING) {
        return this.toDeletionResponse(existing);
      }

      const request = existing
        ? await transaction.accountDeletionRequest.update({
            where: { id: existing.id },
            data: {
              status: AccountDeletionStatus.PENDING,
              requestedAt: now,
              scheduledFor,
              cancelledAt: null,
              processingStartedAt: null,
              completedAt: null,
              attempts: 0,
              lastAttemptAt: null,
              lastErrorCode: null,
            },
          })
        : await transaction.accountDeletionRequest.create({
            data: {
              userId,
              status: AccountDeletionStatus.PENDING,
              requestedAt: now,
              scheduledFor,
            },
          });
      await this.audit.record(
        {
          userId,
          action: 'ACCOUNT_DELETION_REQUESTED',
          entity: 'AccountDeletionRequest',
          entityId: request.id,
          metadata: {
            deletionRequestId: request.id,
            operation: 'REQUEST',
            scheduledFor: scheduledFor.toISOString(),
          },
        },
        transaction,
      );
      return this.toDeletionResponse(request);
    });
  }

  async cancelAccountDeletion(userId: string, dto: CancelAccountDeletionDto) {
    const verified = await this.verifyPatientPassword(
      userId,
      dto.currentPassword,
    );
    return this.prisma.$transaction(async (transaction) => {
      await this.assertPasswordHasNotChanged(transaction, verified);
      const existing = await transaction.accountDeletionRequest.findUnique({
        where: { userId },
      });
      if (!existing) {
        throw new NotFoundException('No account deletion request was found');
      }
      if (existing.status === AccountDeletionStatus.PROCESSING) {
        throw new ConflictException('Account deletion is already processing');
      }
      if (existing.status === AccountDeletionStatus.CANCELLED) {
        return this.toDeletionResponse(existing);
      }
      if (existing.status !== AccountDeletionStatus.PENDING) {
        throw new ConflictException('Account deletion cannot be cancelled');
      }

      const request = await transaction.accountDeletionRequest.update({
        where: { id: existing.id },
        data: {
          status: AccountDeletionStatus.CANCELLED,
          cancelledAt: new Date(),
          processingStartedAt: null,
          lastErrorCode: null,
        },
      });
      await this.audit.record(
        {
          userId,
          action: 'ACCOUNT_DELETION_CANCELLED',
          entity: 'AccountDeletionRequest',
          entityId: request.id,
          metadata: {
            deletionRequestId: request.id,
            operation: 'CANCEL',
          },
        },
        transaction,
      );
      return this.toDeletionResponse(request);
    });
  }

  async requestDataExport(userId: string, dto: RequestPatientDataExportDto) {
    const range = this.parseRange(dto.from, dto.to);
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      await this.assertPatientUser(userId, transaction);
      await transaction.patientDataExportRequest.updateMany({
        where: {
          userId,
          status: PatientDataExportRequestStatus.READY,
          expiresAt: { lte: now },
        },
        data: { status: PatientDataExportRequestStatus.EXPIRED },
      });
      const request = await transaction.patientDataExportRequest.create({
        data: {
          userId,
          format: databaseFormat[dto.format],
          dataset: databaseDataset[dto.dataset],
          from: range.from,
          to: range.to,
          expiresAt: new Date(
            now.getTime() + this.exportExpiryHours * MILLISECONDS_PER_HOUR,
          ),
        },
      });
      await this.audit.record(
        {
          userId,
          action: 'PATIENT_DATA_EXPORT_REQUESTED',
          entity: 'PatientDataExportRequest',
          entityId: request.id,
          metadata: {
            exportRequestId: request.id,
            operation: 'REQUEST',
            dataset: dto.dataset,
            format: dto.format,
            from: dto.from ?? null,
            to: dto.to ?? null,
          },
        },
        transaction,
      );
      return this.toExportRequestResponse(request);
    });
  }

  async listDataExportRequests(userId: string) {
    await this.assertPatientUser(userId);
    const now = new Date();
    await this.prisma.patientDataExportRequest.updateMany({
      where: {
        userId,
        status: PatientDataExportRequestStatus.READY,
        expiresAt: { lte: now },
      },
      data: { status: PatientDataExportRequestStatus.EXPIRED },
    });
    const requests = await this.prisma.patientDataExportRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return requests.map((request) => this.toExportRequestResponse(request));
  }

  async revokeDataExportRequest(userId: string, requestId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await this.assertPatientUser(userId, transaction);
      const request = await transaction.patientDataExportRequest.findFirst({
        where: { id: requestId, userId },
      });
      if (!request)
        throw new NotFoundException('Data export request not found');
      if (request.status === PatientDataExportRequestStatus.REVOKED) return;

      await transaction.patientDataExportRequest.update({
        where: { id: request.id },
        data: { status: PatientDataExportRequestStatus.REVOKED },
      });
      await this.audit.record(
        {
          userId,
          action: 'PATIENT_DATA_EXPORT_REVOKED',
          entity: 'PatientDataExportRequest',
          entityId: request.id,
          metadata: {
            exportRequestId: request.id,
            operation: 'REVOKE',
            dataset: apiDataset[request.dataset],
            format: apiFormat[request.format],
          },
        },
        transaction,
      );
    });
  }

  async downloadDataExport(
    userId: string,
    requestId: string,
  ): Promise<PatientDataExportFile> {
    await this.assertPatientUser(userId);
    const request = await this.prisma.patientDataExportRequest.findFirst({
      where: { id: requestId, userId },
    });
    if (!request) throw new NotFoundException('Data export request not found');
    const now = new Date();
    if (
      request.status !== PatientDataExportRequestStatus.READY ||
      request.expiresAt.getTime() <= now.getTime()
    ) {
      if (
        request.status === PatientDataExportRequestStatus.READY &&
        request.expiresAt.getTime() <= now.getTime()
      ) {
        await this.prisma.patientDataExportRequest.updateMany({
          where: {
            id: request.id,
            userId,
            status: PatientDataExportRequestStatus.READY,
          },
          data: { status: PatientDataExportRequestStatus.EXPIRED },
        });
      }
      throw new GoneException('Data export request is no longer available');
    }

    const dataset = apiDataset[request.dataset];
    const format = apiFormat[request.format];
    const records = await this.loadExportRows(userId, dataset, {
      from: request.from,
      to: request.to,
    });
    const document: PatientExportDocument = {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      dataset,
      dateRange: {
        from: request.from?.toISOString() ?? null,
        to: request.to?.toISOString() ?? null,
      },
      records,
    };
    const rendered = renderPatientExport(document, format);

    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.patientDataExportRequest.updateMany({
        where: {
          id: request.id,
          userId,
          status: PatientDataExportRequestStatus.READY,
          expiresAt: { gt: new Date() },
        },
        data: { downloadedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new GoneException('Data export request is no longer available');
      }
      await this.audit.record(
        {
          userId,
          action: 'PATIENT_DATA_EXPORTED',
          entity: 'PatientDataExportRequest',
          entityId: request.id,
          metadata: {
            exportRequestId: request.id,
            operation: 'DOWNLOAD',
            dataset,
            format,
            count: records.length,
          },
        },
        transaction,
      );
    });

    const date = now.toISOString().slice(0, 10);
    return {
      ...rendered,
      filename: `patient-data-${dataset}-${date}.${rendered.extension}`,
    };
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'account-deletion-finalization',
    waitForCompletion: true,
  })
  async scheduledDeletionFinalization(): Promise<void> {
    if (this.deletionProcessorRunning) return;
    this.deletionProcessorRunning = true;
    try {
      const result = await this.processDueDeletionRequests();
      if (result.completed > 0) {
        this.logger.log(
          `Finalized ${result.completed} scheduled account deletion(s)`,
        );
      }
      if (result.failed > 0) {
        this.logger.warn(
          `${result.failed} account deletion(s) will be retried`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Account deletion processing failed (${this.errorCode(error)})`,
      );
    } finally {
      this.deletionProcessorRunning = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'patient-export-expiration',
    waitForCompletion: true,
  })
  async expireDataExportRequests(): Promise<number> {
    const expired = await this.prisma.patientDataExportRequest.updateMany({
      where: {
        status: PatientDataExportRequestStatus.READY,
        expiresAt: { lte: new Date() },
      },
      data: { status: PatientDataExportRequestStatus.EXPIRED },
    });
    return expired.count;
  }

  async processDueDeletionRequests(limit = 25): Promise<{
    completed: number;
    failed: number;
  }> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MILLISECONDS);
    const candidates = await this.prisma.accountDeletionRequest.findMany({
      where: {
        OR: [
          {
            status: AccountDeletionStatus.PENDING,
            scheduledFor: { lte: now },
          },
          {
            status: AccountDeletionStatus.PROCESSING,
            processingStartedAt: { lte: staleBefore },
          },
        ],
      },
      select: { id: true, userId: true },
      orderBy: { scheduledFor: 'asc' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    let completed = 0;
    let failed = 0;

    for (const candidate of candidates) {
      const claimed = await this.prisma.accountDeletionRequest.updateMany({
        where: {
          id: candidate.id,
          OR: [
            {
              status: AccountDeletionStatus.PENDING,
              scheduledFor: { lte: now },
            },
            {
              status: AccountDeletionStatus.PROCESSING,
              processingStartedAt: { lte: staleBefore },
            },
          ],
        },
        data: {
          status: AccountDeletionStatus.PROCESSING,
          processingStartedAt: new Date(),
          lastAttemptAt: new Date(),
          attempts: { increment: 1 },
          lastErrorCode: null,
        },
      });
      if (claimed.count === 0) continue;

      try {
        if (
          await this.finalizeAccountDeletion(candidate.id, candidate.userId)
        ) {
          completed += 1;
        }
      } catch (error) {
        failed += 1;
        await this.prisma.accountDeletionRequest.updateMany({
          where: {
            id: candidate.id,
            status: AccountDeletionStatus.PROCESSING,
          },
          data: {
            status: AccountDeletionStatus.PENDING,
            processingStartedAt: null,
            lastErrorCode: this.errorCode(error),
          },
        });
      }
    }
    return { completed, failed };
  }

  private async finalizeAccountDeletion(
    requestId: string,
    userId: string | null,
  ): Promise<boolean> {
    if (!userId) {
      const completed = await this.prisma.accountDeletionRequest.updateMany({
        where: { id: requestId, status: AccountDeletionStatus.PROCESSING },
        data: {
          status: AccountDeletionStatus.COMPLETED,
          completedAt: new Date(),
          processingStartedAt: null,
          lastErrorCode: null,
        },
      });
      return completed.count > 0;
    }

    while (true) {
      const documents = await this.prisma.healthDocument.findMany({
        where: { patient: { userId } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      if (documents.length === 0) break;
      for (const document of documents) {
        await this.documents.remove(userId, document.id);
      }
    }

    return this.prisma.$transaction(async (transaction) => {
      const request = await transaction.accountDeletionRequest.findFirst({
        where: {
          id: requestId,
          userId,
          status: AccountDeletionStatus.PROCESSING,
        },
        select: { id: true },
      });
      if (!request) return false;

      const completedAt = new Date();
      await transaction.accountDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: AccountDeletionStatus.COMPLETED,
          completedAt,
          processingStartedAt: null,
          lastErrorCode: null,
        },
      });
      await this.audit.record(
        {
          userId,
          action: 'ACCOUNT_DELETION_COMPLETED',
          entity: 'AccountDeletionRequest',
          entityId: request.id,
          metadata: {
            deletionRequestId: request.id,
            operation: 'FINALIZE',
          },
        },
        transaction,
      );
      const deleted = await transaction.user.deleteMany({
        where: { id: userId, role: UserRole.PATIENT },
      });
      if (deleted.count !== 1) {
        throw new NotFoundException('Patient account not found');
      }
      return true;
    });
  }

  private async loadExportRows(
    userId: string,
    dataset: PatientExportDataset,
    range: ExportRange,
  ): Promise<PatientExportRow[]> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: {
        id: true,
        dateOfBirth: true,
        phoneNumber: true,
        emergencyContact: true,
        timeZone: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');

    if (dataset === PatientExportDataset.MEDICATIONS) {
      return this.medicationRows(patient.id, range);
    }
    if (dataset === PatientExportDataset.MEASUREMENTS) {
      return this.measurementRows(patient.id, range);
    }
    if (dataset === PatientExportDataset.APPOINTMENTS) {
      return this.appointmentRows(patient.id, range);
    }
    if (dataset === PatientExportDataset.WEARABLE_DATA) {
      return this.wearableRows(patient.id, range);
    }
    if (dataset === PatientExportDataset.ALERTS) {
      return this.alertRows(patient.id, range);
    }

    const [medications, measurements, appointments, wearables, alerts] =
      await Promise.all([
        this.medicationRows(patient.id, range),
        this.measurementRows(patient.id, range),
        this.appointmentRows(patient.id, range),
        this.wearableRows(patient.id, range),
        this.alertRows(patient.id, range),
      ]);
    return [
      {
        dataset: 'profile',
        recordType: 'patient',
        name: patient.user.name,
        email: patient.user.email,
        dateOfBirth: this.iso(patient.dateOfBirth),
        phoneNumber: patient.phoneNumber,
        emergencyContact: patient.emergencyContact,
        timeZone: patient.timeZone,
        createdAt: patient.createdAt.toISOString(),
        updatedAt: patient.updatedAt.toISOString(),
      },
      ...medications,
      ...measurements,
      ...appointments,
      ...wearables,
      ...alerts,
    ];
  }

  private async medicationRows(
    patientId: string,
    range: ExportRange,
  ): Promise<PatientExportRow[]> {
    const dated = this.dateFilter(range);
    const medications = await this.prisma.medication.findMany({
      where: {
        patientId,
        ...(range.to ? { startDate: { lte: range.to } } : {}),
        ...(range.from
          ? { OR: [{ endDate: null }, { endDate: { gte: range.from } }] }
          : {}),
      },
      include: { schedules: { orderBy: { scheduledTime: 'asc' } } },
      orderBy: { createdAt: 'asc' },
      take: this.maxExportRecords + 1,
    });
    const logs = await this.prisma.medicationLog.findMany({
      where: {
        medication: { patientId },
        ...(dated ? { scheduledFor: dated } : {}),
      },
      include: { medication: { select: { name: true } } },
      orderBy: { scheduledFor: 'asc' },
      take: this.maxExportRecords + 1,
    });
    this.assertWithinExportLimit(medications, 'medications');
    this.assertWithinExportLimit(logs, 'medication logs');

    return [
      ...medications.flatMap((medication) => [
        {
          dataset: 'medications',
          recordType: 'medication',
          id: medication.id,
          name: medication.name,
          dosage: medication.dosage,
          instructions: medication.instructions,
          startDate: medication.startDate.toISOString(),
          endDate: this.iso(medication.endDate),
          status: medication.status,
          remainingQuantity: medication.remainingQuantity,
          quantityUnit: medication.quantityUnit,
          lowQuantityThreshold: medication.lowQuantityThreshold,
          nextRefillDate: this.iso(medication.nextRefillDate),
          pharmacyName: medication.pharmacyName,
          createdAt: medication.createdAt.toISOString(),
          updatedAt: medication.updatedAt.toISOString(),
        },
        ...medication.schedules.map((schedule) => ({
          dataset: 'medications',
          recordType: 'schedule',
          id: schedule.id,
          medicationId: medication.id,
          medicationName: medication.name,
          scheduledTime: schedule.scheduledTime,
          frequency: schedule.frequency,
          createdAt: schedule.createdAt.toISOString(),
          updatedAt: schedule.updatedAt.toISOString(),
        })),
      ]),
      ...logs.map((log) => ({
        dataset: 'medications',
        recordType: 'medication-log',
        id: log.id,
        medicationId: log.medicationId,
        medicationName: log.medication.name,
        scheduleId: log.scheduleId,
        scheduleDate: this.iso(log.scheduleDate),
        scheduledFor: log.scheduledFor.toISOString(),
        takenAt: this.iso(log.takenAt),
        status: log.status,
        createdAt: log.createdAt.toISOString(),
        updatedAt: log.updatedAt.toISOString(),
      })),
    ];
  }

  private async measurementRows(
    patientId: string,
    range: ExportRange,
  ): Promise<PatientExportRow[]> {
    const dated = this.dateFilter(range);
    const records = await this.prisma.measurement.findMany({
      where: { patientId, ...(dated ? { measuredAt: dated } : {}) },
      orderBy: { measuredAt: 'asc' },
      take: this.maxExportRecords + 1,
    });
    this.assertWithinExportLimit(records, 'measurements');
    return records.map((record) => ({
      dataset: 'measurements',
      recordType: 'measurement',
      id: record.id,
      type: record.type,
      value: record.value,
      secondaryValue: record.secondaryValue,
      unit: record.unit,
      measuredAt: record.measuredAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  private async appointmentRows(
    patientId: string,
    range: ExportRange,
  ): Promise<PatientExportRow[]> {
    const dated = this.dateFilter(range);
    const records = await this.prisma.appointment.findMany({
      where: { patientId, ...(dated ? { appointmentDate: dated } : {}) },
      include: {
        doctor: {
          select: {
            specialization: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { appointmentDate: 'asc' },
      take: this.maxExportRecords + 1,
    });
    this.assertWithinExportLimit(records, 'appointments');
    return records.map((record) => ({
      dataset: 'appointments',
      recordType: 'appointment',
      id: record.id,
      doctorName: record.doctor.user.name,
      doctorSpecialization: record.doctor.specialization,
      appointmentDate: record.appointmentDate.toISOString(),
      appointmentEnd: record.appointmentEnd.toISOString(),
      durationMinutes: record.durationMinutes,
      status: record.status,
      notes: record.notes,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  private async wearableRows(
    patientId: string,
    range: ExportRange,
  ): Promise<PatientExportRow[]> {
    const dated = this.dateFilter(range);
    const [devices, metrics, syncRuns] = await Promise.all([
      this.prisma.wearableDevice.findMany({
        where: { patientId },
        orderBy: { connectedAt: 'asc' },
        take: this.maxExportRecords + 1,
      }),
      this.prisma.healthMetric.findMany({
        where: { patientId, ...(dated ? { measuredAt: dated } : {}) },
        include: {
          wearableDevice: {
            select: { provider: true, deviceName: true },
          },
        },
        orderBy: { measuredAt: 'asc' },
        take: this.maxExportRecords + 1,
      }),
      this.prisma.wearableSyncRun.findMany({
        where: { patientId, ...(dated ? { startedAt: dated } : {}) },
        orderBy: { startedAt: 'asc' },
        take: this.maxExportRecords + 1,
      }),
    ]);
    this.assertWithinExportLimit(devices, 'wearable devices');
    this.assertWithinExportLimit(metrics, 'wearable measurements');
    this.assertWithinExportLimit(syncRuns, 'wearable sync history');

    return [
      ...devices.map((device) => ({
        dataset: 'wearable-data',
        recordType: 'device',
        id: device.id,
        provider: device.provider,
        deviceName: device.deviceName,
        externalDeviceId: device.externalDeviceId,
        connectedAt: device.connectedAt.toISOString(),
        lastSyncAt: this.iso(device.lastSyncAt),
        active: device.active,
        createdAt: device.createdAt.toISOString(),
        updatedAt: device.updatedAt.toISOString(),
      })),
      ...metrics.map((metric) => ({
        dataset: 'wearable-data',
        recordType: 'health-metric',
        id: metric.id,
        wearableDeviceId: metric.wearableDeviceId,
        provider: metric.wearableDevice?.provider ?? null,
        deviceName: metric.wearableDevice?.deviceName ?? null,
        metricType: metric.metricType,
        value: metric.value,
        secondaryValue: metric.secondaryValue,
        unit: metric.unit,
        measuredAt: metric.measuredAt.toISOString(),
        source: metric.source,
        externalRecordId: metric.externalRecordId,
        metadata: metric.metadata ? JSON.stringify(metric.metadata) : null,
        createdAt: metric.createdAt.toISOString(),
      })),
      ...syncRuns.map((run) => ({
        dataset: 'wearable-data',
        recordType: 'sync-run',
        id: run.id,
        wearableDeviceId: run.wearableDeviceId,
        provider: run.provider,
        status: run.status,
        receivedCount: run.receivedCount,
        importedCount: run.importedCount,
        duplicateCount: run.duplicateCount,
        rejectedCount: run.rejectedCount,
        errorCount: run.errorCount,
        startedAt: run.startedAt.toISOString(),
        completedAt: this.iso(run.completedAt),
      })),
    ];
  }

  private async alertRows(
    patientId: string,
    range: ExportRange,
  ): Promise<PatientExportRow[]> {
    const dated = this.dateFilter(range);
    const [rules, alerts] = await Promise.all([
      this.prisma.alertRule.findMany({
        where: { patientId },
        orderBy: { createdAt: 'asc' },
        take: this.maxExportRecords + 1,
      }),
      this.prisma.healthAlert.findMany({
        where: { patientId, ...(dated ? { detectedAt: dated } : {}) },
        include: {
          transitions: { orderBy: { occurredAt: 'asc' } },
          reviews: {
            include: {
              doctor: { select: { user: { select: { name: true } } } },
            },
            orderBy: { reviewedAt: 'asc' },
          },
        },
        orderBy: { detectedAt: 'asc' },
        take: this.maxExportRecords + 1,
      }),
    ]);
    this.assertWithinExportLimit(rules, 'alert rules');
    this.assertWithinExportLimit(alerts, 'alerts');

    return [
      ...rules.map((rule) => ({
        dataset: 'alerts',
        recordType: 'alert-rule',
        id: rule.id,
        metricType: rule.metricType,
        enabled: rule.enabled,
        minimumValue: rule.minimumValue,
        maximumValue: rule.maximumValue,
        consecutiveReadingsRequired: rule.consecutiveReadingsRequired,
        severity: rule.severity,
        notifyEmergencyContacts: rule.notifyEmergencyContacts,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      })),
      ...alerts.flatMap((alert) => [
        {
          dataset: 'alerts',
          recordType: 'health-alert',
          id: alert.id,
          metricType: alert.metricType,
          severity: alert.severity,
          message: alert.message,
          metricId: alert.metricId,
          alertRuleId: alert.alertRuleId,
          status: alert.status,
          detectedAt: alert.detectedAt.toISOString(),
          acknowledgedAt: this.iso(alert.acknowledgedAt),
          resolvedAt: this.iso(alert.resolvedAt),
          abnormalReadingCount: alert.abnormalReadingCount,
          createdAt: alert.createdAt.toISOString(),
          updatedAt: alert.updatedAt.toISOString(),
        },
        ...alert.transitions.map((transition) => ({
          dataset: 'alerts',
          recordType: 'alert-transition',
          id: transition.id,
          alertId: alert.id,
          fromSeverity: transition.fromSeverity,
          toSeverity: transition.toSeverity,
          abnormalReadingCount: transition.abnormalReadingCount,
          reason: transition.reason,
          occurredAt: transition.occurredAt.toISOString(),
        })),
        ...alert.reviews.map((review) => ({
          dataset: 'alerts',
          recordType: 'alert-review',
          id: review.id,
          alertId: alert.id,
          doctorName: review.doctor.user.name,
          note: review.note,
          reviewedAt: review.reviewedAt.toISOString(),
        })),
      ]),
    ];
  }

  private dateFilter(range: ExportRange): Prisma.DateTimeFilter | undefined {
    if (!range.from && !range.to) return undefined;
    return {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    };
  }

  private parseRange(from?: string, to?: string): ExportRange {
    const range = {
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
    };
    if (range.from && range.to && range.from.getTime() > range.to.getTime()) {
      throw new BadRequestException('from must be before or equal to to');
    }
    return range;
  }

  private async verifyPatientPassword(userId: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.PATIENT },
      select: { id: true, passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Password verification failed');
    }
    return user;
  }

  private async assertPasswordHasNotChanged(
    transaction: Prisma.TransactionClient,
    verified: { id: string; passwordHash: string },
  ): Promise<void> {
    const user = await transaction.user.findFirst({
      where: {
        id: verified.id,
        role: UserRole.PATIENT,
        passwordHash: verified.passwordHash,
      },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Password verification failed');
  }

  private async assertPatientUser(
    userId: string,
    database: Pick<Prisma.TransactionClient, 'user'> = this.prisma,
  ): Promise<void> {
    const user = await database.user.findFirst({
      where: { id: userId, role: UserRole.PATIENT },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Patient account not found');
  }

  private assertWithinExportLimit(records: unknown[], description: string) {
    if (records.length > this.maxExportRecords) {
      throw new PayloadTooLargeException(
        `Too many ${description} to generate safely; request a narrower date range`,
      );
    }
  }

  private toDeletionResponse(request: {
    id: string;
    status: AccountDeletionStatus;
    requestedAt: Date;
    scheduledFor: Date;
    cancelledAt: Date | null;
    completedAt: Date | null;
  }) {
    return {
      requestId: request.id,
      status: request.status,
      requestedAt: request.requestedAt,
      scheduledFor: request.scheduledFor,
      cancelledAt: request.cancelledAt,
      completedAt: request.completedAt,
    };
  }

  private toExportRequestResponse(request: {
    id: string;
    format: DatabaseExportFormat;
    dataset: DatabaseExportDataset;
    status: PatientDataExportRequestStatus;
    from: Date | null;
    to: Date | null;
    expiresAt: Date;
    downloadedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      requestId: request.id,
      format: apiFormat[request.format],
      dataset: apiDataset[request.dataset],
      status: request.status,
      from: request.from,
      to: request.to,
      expiresAt: request.expiresAt,
      downloadedAt: request.downloadedAt,
      createdAt: request.createdAt,
    };
  }

  private iso(value: Date | null | undefined): string | null {
    return value?.toISOString() ?? null;
  }

  private configuredInteger(
    config: ConfigService,
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(config.get<string>(key));
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum
      ? value
      : fallback;
  }

  private errorCode(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code.slice(0, 64);
    }
    return error instanceof Error
      ? error.constructor.name.slice(0, 64)
      : 'UnknownError';
  }
}
