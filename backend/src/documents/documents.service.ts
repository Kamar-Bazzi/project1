import {
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentStorageService,
  UploadedDocumentFile,
} from './document-storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

const publicDocumentSelect = {
  id: true,
  title: true,
  category: true,
  description: true,
  documentDate: true,
  originalFileName: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HealthDocumentSelect;

const privateDocumentSelect = {
  ...publicDocumentSelect,
  storageKey: true,
  sha256: true,
} satisfies Prisma.HealthDocumentSelect;

type PublicDocument = Prisma.HealthDocumentGetPayload<{
  select: typeof publicDocumentSelect;
}>;

type DocumentDatabaseClient = Prisma.TransactionClient | PrismaService;

const DEFAULT_MAX_DOCUMENTS_PER_PATIENT = 500;
const DEFAULT_MAX_DOCUMENT_BYTES_PER_PATIENT = 1024 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_DOCUMENT_BYTES = 100 * 1024 * 1024 * 1024;

export interface DocumentDownload {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly maxDocumentsPerPatient: number;
  private readonly maxDocumentBytesPerPatient: number;
  private readonly maxTotalDocumentBytes: number;
  private deletionReconciliationRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
    private readonly storage: DocumentStorageService,
    config: ConfigService,
  ) {
    this.maxDocumentsPerPatient = this.configuredPositiveInteger(
      config,
      'DOCUMENT_MAX_FILES_PER_PATIENT',
      DEFAULT_MAX_DOCUMENTS_PER_PATIENT,
    );
    this.maxDocumentBytesPerPatient = this.configuredPositiveInteger(
      config,
      'DOCUMENT_MAX_BYTES_PER_PATIENT',
      DEFAULT_MAX_DOCUMENT_BYTES_PER_PATIENT,
    );
    this.maxTotalDocumentBytes = this.configuredPositiveInteger(
      config,
      'DOCUMENT_MAX_TOTAL_BYTES',
      DEFAULT_MAX_TOTAL_DOCUMENT_BYTES,
    );
  }

  async listForPatient(patientUserId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const patient = await this.access.getPatientForUser(
        patientUserId,
        transaction,
      );
      const documents = await transaction.healthDocument.findMany({
        where: { patientId: patient.id, deletionPendingAt: null },
        select: publicDocumentSelect,
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      });
      await this.recordListAudit(
        transaction,
        patientUserId,
        patient.id,
        documents.length,
      );
      return documents.map((document) => this.toResponse(document));
    });
  }

  async listForDoctor(doctorUserId: string, patientId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
        'DOCUMENTS',
      );
      const documents = await transaction.healthDocument.findMany({
        where: { patientId, deletionPendingAt: null },
        select: publicDocumentSelect,
        orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
      });
      await this.recordListAudit(
        transaction,
        doctorUserId,
        patientId,
        documents.length,
        doctor.id,
      );
      return documents.map((document) => this.toResponse(document));
    });
  }

  async upload(
    patientUserId: string,
    dto: UploadDocumentDto,
    file: UploadedDocumentFile | undefined,
  ) {
    const patient = await this.access.getPatientForUser(patientUserId);
    const stored = await this.storage.store(file);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await this.assertWithinStorageQuota(
            transaction,
            patient.id,
            stored.sizeBytes,
          );
          const document = await transaction.healthDocument.create({
            data: {
              patientId: patient.id,
              uploadedByUserId: patientUserId,
              title: dto.title,
              category: dto.category,
              description: dto.description ?? null,
              documentDate: dto.documentDate
                ? new Date(`${dto.documentDate}T00:00:00.000Z`)
                : null,
              originalFileName: stored.originalFileName,
              storageKey: stored.storageKey,
              contentType: stored.contentType,
              sizeBytes: stored.sizeBytes,
              sha256: stored.sha256,
            },
            select: publicDocumentSelect,
          });
          await this.audit.record(
            {
              userId: patientUserId,
              action: 'HEALTH_DOCUMENT_UPLOADED',
              entity: 'HealthDocument',
              entityId: document.id,
              metadata: { patientId: patient.id, operation: 'UPLOAD' },
            },
            transaction,
          );
          return this.toResponse(document);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      await this.storage.remove(stored.storageKey);
      throw error;
    }
  }

  async downloadForPatient(
    patientUserId: string,
    documentId: string,
  ): Promise<DocumentDownload> {
    const context = await this.prisma.$transaction(async (transaction) => {
      const patient = await this.access.getPatientForUser(
        patientUserId,
        transaction,
      );
      const result = await transaction.healthDocument.findFirst({
        where: {
          id: documentId,
          patientId: patient.id,
          deletionPendingAt: null,
        },
        select: privateDocumentSelect,
      });
      if (!result) throw new NotFoundException('Document not found');
      return { document: result, patientId: patient.id };
    });
    const download = await this.readDownload(context.document);
    await this.audit.record({
      userId: patientUserId,
      action: 'HEALTH_DOCUMENT_DOWNLOADED',
      entity: 'HealthDocument',
      entityId: context.document.id,
      metadata: { patientId: context.patientId, operation: 'DOWNLOAD' },
    });
    return download;
  }

  async downloadForDoctor(
    doctorUserId: string,
    patientId: string,
    documentId: string,
  ): Promise<DocumentDownload> {
    const context = await this.prisma.$transaction(async (transaction) => {
      const { doctor } = await this.access.requireAssignedPatient(
        doctorUserId,
        patientId,
        transaction,
        'DOCUMENTS',
      );
      const result = await transaction.healthDocument.findFirst({
        where: { id: documentId, patientId, deletionPendingAt: null },
        select: privateDocumentSelect,
      });
      if (!result) throw new NotFoundException('Document not found');
      return { document: result, doctorId: doctor.id };
    });
    const download = await this.readDownload(context.document);
    await this.audit.record({
      userId: doctorUserId,
      action: 'HEALTH_DOCUMENT_DOWNLOADED',
      entity: 'HealthDocument',
      entityId: context.document.id,
      metadata: {
        patientId,
        doctorId: context.doctorId,
        operation: 'DOWNLOAD',
      },
    });
    return download;
  }

  async remove(patientUserId: string, documentId: string): Promise<void> {
    const document = await this.prisma.$transaction(async (transaction) => {
      const patient = await this.access.getPatientForUser(
        patientUserId,
        transaction,
      );
      const existing = await transaction.healthDocument.findFirst({
        where: { id: documentId, patientId: patient.id },
        select: {
          id: true,
          patientId: true,
          storageKey: true,
          deletionPendingAt: true,
        },
      });
      if (!existing) throw new NotFoundException('Document not found');

      if (!existing.deletionPendingAt) {
        const claimed = await transaction.healthDocument.updateMany({
          where: {
            id: existing.id,
            patientId: patient.id,
            deletionPendingAt: null,
          },
          data: { deletionPendingAt: new Date() },
        });
        if (claimed.count > 0) {
          await this.audit.record(
            {
              userId: patientUserId,
              action: 'HEALTH_DOCUMENT_DELETE_REQUESTED',
              entity: 'HealthDocument',
              entityId: existing.id,
              metadata: { patientId: patient.id, operation: 'DELETE_REQUEST' },
            },
            transaction,
          );
        }
      }

      return {
        id: existing.id,
        patientId: patient.id,
        storageKey: existing.storageKey,
      };
    });

    await this.finalizeDeletion(document, patientUserId);
  }

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'document-deletion-reconciliation',
    waitForCompletion: true,
  })
  async scheduledDeletionReconciliation(): Promise<void> {
    if (this.deletionReconciliationRunning) return;
    this.deletionReconciliationRunning = true;
    try {
      const { completed, failed } = await this.processPendingDeletions();
      if (completed > 0) {
        this.logger.log(`Reconciled ${completed} pending document deletion(s)`);
      }
      if (failed > 0) {
        this.logger.warn(
          `${failed} pending document deletion(s) could not be reconciled`,
        );
      }
    } catch (error) {
      const code =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.error(`Document deletion reconciliation failed (${code})`);
    } finally {
      this.deletionReconciliationRunning = false;
    }
  }

  async processPendingDeletions(): Promise<{
    completed: number;
    failed: number;
  }> {
    const pending = await this.prisma.healthDocument.findMany({
      where: { deletionPendingAt: { not: null } },
      select: { id: true, patientId: true, storageKey: true },
      orderBy: { deletionPendingAt: 'asc' },
      take: 100,
    });
    let completed = 0;
    let failed = 0;
    for (const document of pending) {
      try {
        if (await this.finalizeDeletion(document)) completed += 1;
      } catch {
        failed += 1;
      }
    }
    return { completed, failed };
  }

  private async finalizeDeletion(
    document: { id: string; patientId: string; storageKey: string },
    userId?: string,
  ): Promise<boolean> {
    await this.storage.remove(document.storageKey);
    return this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.healthDocument.deleteMany({
        where: {
          id: document.id,
          patientId: document.patientId,
          deletionPendingAt: { not: null },
        },
      });
      if (deleted.count === 0) return false;

      await this.audit.record(
        {
          userId,
          action: 'HEALTH_DOCUMENT_DELETED',
          entity: 'HealthDocument',
          entityId: document.id,
          metadata: {
            patientId: document.patientId,
            operation: userId ? 'DELETE' : 'DELETE_RECONCILED',
          },
        },
        transaction,
      );
      return true;
    });
  }

  private async readDownload(document: {
    storageKey: string;
    sha256: string;
    originalFileName: string;
    contentType: string;
  }): Promise<DocumentDownload> {
    return {
      buffer: await this.storage.read(document.storageKey, document.sha256),
      fileName: document.originalFileName,
      contentType: document.contentType,
    };
  }

  private toResponse(document: PublicDocument) {
    return { ...document, status: 'AVAILABLE' as const };
  }

  private async recordListAudit(
    transaction: Prisma.TransactionClient,
    userId: string,
    patientId: string,
    count: number,
    doctorId?: string,
  ): Promise<void> {
    await this.audit.record(
      {
        userId,
        action: 'HEALTH_DOCUMENT_LIST_ACCESSED',
        entity: 'HealthDocument',
        metadata: {
          patientId,
          ...(doctorId ? { doctorId } : {}),
          count,
          operation: 'LIST',
        },
      },
      transaction,
    );
  }

  private async assertWithinStorageQuota(
    database: DocumentDatabaseClient,
    patientId: string,
    incomingBytes: number,
  ): Promise<void> {
    const [patientUsage, totalUsage] = await Promise.all([
      database.healthDocument.aggregate({
        where: { patientId },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      database.healthDocument.aggregate({
        _sum: { sizeBytes: true },
      }),
    ]);
    const documentCount = patientUsage._count._all;
    const storedBytes = patientUsage._sum.sizeBytes ?? 0;
    const totalStoredBytes = totalUsage._sum.sizeBytes ?? 0;
    if (
      documentCount >= this.maxDocumentsPerPatient ||
      storedBytes + incomingBytes > this.maxDocumentBytesPerPatient ||
      totalStoredBytes + incomingBytes > this.maxTotalDocumentBytes
    ) {
      throw new PayloadTooLargeException(
        'Patient document storage quota reached',
      );
    }
  }

  private configuredPositiveInteger(
    config: ConfigService,
    key: string,
    fallback: number,
  ): number {
    const parsed = Number(config.get<string>(key));
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
