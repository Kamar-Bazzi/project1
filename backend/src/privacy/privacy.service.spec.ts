import {
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountDeletionStatus,
  PatientDataExportDataset,
  PatientDataExportFormat,
  PatientDataExportRequestStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { PatientExportDataset, PatientExportFormat } from './dto/privacy.dto';
import { PrivacyService } from './privacy.service';

describe('PrivacyService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const requestId = '22222222-2222-4222-8222-222222222222';
  const exportRequestId = '33333333-3333-4333-8333-333333333333';
  const patientId = '44444444-4444-4444-8444-444444444444';
  const currentPassword = 'StrongPass1';
  let passwordHash: string;

  const userFindFirst = jest.fn();
  const userDeleteMany = jest.fn();
  const patientFindUnique = jest.fn();
  const deletionFindUnique = jest.fn();
  const deletionFindMany = jest.fn();
  const deletionFindFirst = jest.fn();
  const deletionCreate = jest.fn();
  const deletionUpdate = jest.fn();
  const deletionUpdateMany = jest.fn();
  const exportFindFirst = jest.fn();
  const exportFindMany = jest.fn();
  const exportCreate = jest.fn();
  const exportUpdate = jest.fn();
  const exportUpdateMany = jest.fn();
  const healthDocumentFindMany = jest.fn();
  const medicationFindMany = jest.fn();
  const medicationLogFindMany = jest.fn();
  const measurementFindMany = jest.fn();
  const appointmentFindMany = jest.fn();
  const wearableDeviceFindMany = jest.fn();
  const healthMetricFindMany = jest.fn();
  const wearableSyncRunFindMany = jest.fn();
  const alertRuleFindMany = jest.fn();
  const healthAlertFindMany = jest.fn();
  const auditRecord = jest.fn();
  const documentRemove = jest.fn();
  let lastDeletionCreateArguments:
    { data: Record<string, unknown> } | undefined;
  let lastDeletionUpdateArguments:
    { where: { id: string }; data: Record<string, unknown> } | undefined;
  let lastDeletionUpdateManyArguments:
    | { where: Record<string, unknown>; data: Record<string, unknown> }
    | undefined;

  const prisma = {
    user: { findFirst: userFindFirst, deleteMany: userDeleteMany },
    patient: { findUnique: patientFindUnique },
    accountDeletionRequest: {
      findUnique: deletionFindUnique,
      findMany: deletionFindMany,
      findFirst: deletionFindFirst,
      create: deletionCreate,
      update: deletionUpdate,
      updateMany: deletionUpdateMany,
    },
    patientDataExportRequest: {
      findFirst: exportFindFirst,
      findMany: exportFindMany,
      create: exportCreate,
      update: exportUpdate,
      updateMany: exportUpdateMany,
    },
    healthDocument: { findMany: healthDocumentFindMany },
    medication: { findMany: medicationFindMany },
    medicationLog: { findMany: medicationLogFindMany },
    measurement: { findMany: measurementFindMany },
    appointment: { findMany: appointmentFindMany },
    wearableDevice: { findMany: wearableDeviceFindMany },
    healthMetric: { findMany: healthMetricFindMany },
    wearableSyncRun: { findMany: wearableSyncRunFindMany },
    alertRule: { findMany: alertRuleFindMany },
    healthAlert: { findMany: healthAlertFindMany },
    $transaction: jest.fn(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    ),
  };
  const audit = { record: auditRecord };
  const documents = { remove: documentRemove };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  let service: PrivacyService;

  const pendingDeletion = () => ({
    id: requestId,
    userId,
    status: AccountDeletionStatus.PENDING,
    requestedAt: new Date('2026-09-07T12:00:00.000Z'),
    scheduledFor: new Date('2026-10-07T12:00:00.000Z'),
    cancelledAt: null,
    processingStartedAt: null,
    completedAt: null,
    attempts: 0,
    lastAttemptAt: null,
    lastErrorCode: null,
    createdAt: new Date('2026-09-07T12:00:00.000Z'),
    updatedAt: new Date('2026-09-07T12:00:00.000Z'),
  });

  const readyExport = () => ({
    id: exportRequestId,
    userId,
    format: PatientDataExportFormat.JSON,
    dataset: PatientDataExportDataset.MEDICATIONS,
    status: PatientDataExportRequestStatus.READY,
    from: null,
    to: null,
    expiresAt: new Date('2026-09-08T12:00:00.000Z'),
    downloadedAt: null,
    createdAt: new Date('2026-09-07T12:00:00.000Z'),
    updatedAt: new Date('2026-09-07T12:00:00.000Z'),
  });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(currentPassword, 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    lastDeletionCreateArguments = undefined;
    lastDeletionUpdateArguments = undefined;
    lastDeletionUpdateManyArguments = undefined;
    userFindFirst.mockImplementation(
      (arguments_: { select?: { passwordHash?: boolean } }) =>
        Promise.resolve(
          arguments_.select?.passwordHash
            ? { id: userId, passwordHash }
            : { id: userId },
        ),
    );
    patientFindUnique.mockResolvedValue({
      id: patientId,
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      phoneNumber: null,
      emergencyContact: null,
      timeZone: 'Asia/Beirut',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      user: { name: 'Patient', email: 'patient@example.test' },
    });
    deletionFindUnique.mockResolvedValue(null);
    deletionFindMany.mockResolvedValue([]);
    deletionFindFirst.mockResolvedValue({ id: requestId });
    deletionCreate.mockImplementation(
      (arguments_: { data: Record<string, unknown> }) => {
        lastDeletionCreateArguments = arguments_;
        return Promise.resolve({ ...pendingDeletion(), ...arguments_.data });
      },
    );
    deletionUpdate.mockImplementation(
      (arguments_: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        lastDeletionUpdateArguments = arguments_;
        return Promise.resolve({ ...pendingDeletion(), ...arguments_.data });
      },
    );
    deletionUpdateMany.mockImplementation(
      (arguments_: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        lastDeletionUpdateManyArguments = arguments_;
        return Promise.resolve({ count: 1 });
      },
    );
    exportFindFirst.mockResolvedValue(readyExport());
    exportFindMany.mockResolvedValue([]);
    exportCreate.mockImplementation(
      (arguments_: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...readyExport(), ...arguments_.data }),
    );
    exportUpdate.mockResolvedValue(readyExport());
    exportUpdateMany.mockResolvedValue({ count: 1 });
    healthDocumentFindMany.mockResolvedValue([]);
    medicationFindMany.mockResolvedValue([]);
    medicationLogFindMany.mockResolvedValue([]);
    measurementFindMany.mockResolvedValue([]);
    appointmentFindMany.mockResolvedValue([]);
    wearableDeviceFindMany.mockResolvedValue([]);
    healthMetricFindMany.mockResolvedValue([]);
    wearableSyncRunFindMany.mockResolvedValue([]);
    alertRuleFindMany.mockResolvedValue([]);
    healthAlertFindMany.mockResolvedValue([]);
    userDeleteMany.mockResolvedValue({ count: 1 });
    auditRecord.mockResolvedValue(undefined);
    documentRemove.mockResolvedValue(undefined);
    service = new PrivacyService(
      prisma as unknown as PrismaService,
      audit as unknown as HealthAuditService,
      documents as unknown as DocumentsService,
      config as unknown as ConfigService,
    );
  });

  it('re-authenticates and schedules a cancellable deletion request', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    try {
      const result = await service.requestAccountDeletion(userId, {
        currentPassword,
        confirmation: 'DELETE MY ACCOUNT',
      });

      expect(result.status).toBe(AccountDeletionStatus.PENDING);
      expect(result.scheduledFor).toEqual(new Date('2026-10-07T12:00:00.000Z'));
      expect(lastDeletionCreateArguments?.data.userId).toBe(userId);
      expect(lastDeletionCreateArguments?.data.scheduledFor).toEqual(
        result.scheduledFor,
      );
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCOUNT_DELETION_REQUESTED' }),
        prisma,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects deletion when current-password verification fails', async () => {
    await expect(
      service.requestAccountDeletion(userId, {
        currentPassword: 'WrongPass1',
        confirmation: 'DELETE MY ACCOUNT',
      }),
    ).rejects.toEqual(
      new UnauthorizedException('Password verification failed'),
    );
    expect(deletionCreate).not.toHaveBeenCalled();
  });

  it('cancels only the authenticated patient pending request', async () => {
    deletionFindUnique.mockResolvedValue(pendingDeletion());

    const result = await service.cancelAccountDeletion(userId, {
      currentPassword,
    });

    expect(result.status).toBe(AccountDeletionStatus.CANCELLED);
    expect(lastDeletionUpdateArguments?.where).toEqual({ id: requestId });
    expect(lastDeletionUpdateArguments?.data.status).toBe(
      AccountDeletionStatus.CANCELLED,
    );
    expect(lastDeletionUpdateArguments?.data.cancelledAt).toBeInstanceOf(Date);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCOUNT_DELETION_CANCELLED' }),
      prisma,
    );
  });

  it('claims due deletions, removes external document bytes, and deletes atomically', async () => {
    deletionFindMany.mockResolvedValue([{ id: requestId, userId }]);
    healthDocumentFindMany
      .mockResolvedValueOnce([{ id: 'document-1' }])
      .mockResolvedValueOnce([]);

    await expect(service.processDueDeletionRequests()).resolves.toEqual({
      completed: 1,
      failed: 0,
    });
    expect(documentRemove).toHaveBeenCalledWith(userId, 'document-1');
    expect(userDeleteMany).toHaveBeenCalledWith({
      where: { id: userId, role: UserRole.PATIENT },
    });
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCOUNT_DELETION_COMPLETED' }),
      prisma,
    );
  });

  it('releases a deletion claim for a later retry when external cleanup fails', async () => {
    deletionFindMany.mockResolvedValue([{ id: requestId, userId }]);
    healthDocumentFindMany.mockResolvedValue([{ id: 'document-1' }]);
    documentRemove.mockRejectedValue(new Error('storage unavailable'));

    await expect(service.processDueDeletionRequests()).resolves.toEqual({
      completed: 0,
      failed: 1,
    });
    expect(lastDeletionUpdateManyArguments?.where).toEqual({
      id: requestId,
      status: AccountDeletionStatus.PROCESSING,
    });
    expect(lastDeletionUpdateManyArguments?.data.status).toBe(
      AccountDeletionStatus.PENDING,
    );
    expect(lastDeletionUpdateManyArguments?.data.lastErrorCode).toBe('Error');
    expect(userDeleteMany).not.toHaveBeenCalled();
  });

  it('creates an expiring owner-scoped export request and audits its scope', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    try {
      const result = await service.requestDataExport(userId, {
        format: PatientExportFormat.JSON,
        dataset: PatientExportDataset.MEDICATIONS,
      });

      expect(result).toEqual(
        expect.objectContaining({
          requestId: exportRequestId,
          format: 'json',
          dataset: 'medications',
          status: PatientDataExportRequestStatus.READY,
          expiresAt: new Date('2026-09-08T12:00:00.000Z'),
        }),
      );
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PATIENT_DATA_EXPORT_REQUESTED' }),
        prisma,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('generates medication JSON only for the authenticated request owner', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    medicationFindMany.mockResolvedValue([
      {
        id: 'medication-1',
        name: 'Example medication',
        dosage: '5 mg',
        instructions: null,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        status: 'ACTIVE',
        remainingQuantity: 10,
        quantityUnit: 'tablet',
        lowQuantityThreshold: 3,
        nextRefillDate: null,
        pharmacyName: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        schedules: [],
      },
    ]);
    try {
      const file = await service.downloadDataExport(userId, exportRequestId);
      const content = JSON.parse(file.content.toString('utf8')) as {
        records: Array<{ dataset: string; name: string }>;
      };

      expect(content.records).toEqual([
        expect.objectContaining({
          dataset: 'medications',
          name: 'Example medication',
        }),
      ]);
      expect(file.contentType).toBe('application/json; charset=utf-8');
      expect(file.filename).toBe('patient-data-medications-2026-09-07.json');
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PATIENT_DATA_EXPORTED' }),
        prisma,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not disclose or generate another user export request', async () => {
    exportFindFirst.mockResolvedValue(null);

    await expect(
      service.downloadDataExport(userId, exportRequestId),
    ).rejects.toEqual(new NotFoundException('Data export request not found'));
    expect(medicationFindMany).not.toHaveBeenCalled();
  });

  it('rejects an expired export and durably marks it expired', async () => {
    exportFindFirst.mockResolvedValue({
      ...readyExport(),
      expiresAt: new Date('2026-09-06T12:00:00.000Z'),
    });

    await expect(
      service.downloadDataExport(userId, exportRequestId),
    ).rejects.toEqual(
      new GoneException('Data export request is no longer available'),
    );
    expect(exportUpdateMany).toHaveBeenCalledWith({
      where: {
        id: exportRequestId,
        userId,
        status: PatientDataExportRequestStatus.READY,
      },
      data: { status: PatientDataExportRequestStatus.EXPIRED },
    });
  });
});
