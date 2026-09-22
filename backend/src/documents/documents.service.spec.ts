import { NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { HealthDocumentCategory } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStorageService } from './document-storage.service';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  function createService(transaction: object, prismaOverrides: object = {}) {
    const prisma = {
      $transaction: jest.fn((operation: (client: object) => Promise<unknown>) =>
        operation(transaction),
      ),
      ...prismaOverrides,
    } as unknown as PrismaService;
    const requireAssignedPatient = jest.fn().mockResolvedValue({
      doctor: { id: 'doctor-1' },
      patient: { id: 'patient-1' },
    });
    const getPatientForUser = jest
      .fn()
      .mockResolvedValue({ id: 'patient-1', userId: 'patient-user' });
    const access = {
      requireAssignedPatient,
      getPatientForUser,
    } as unknown as ClinicalAccessService;
    const auditRecord = jest.fn().mockResolvedValue(undefined);
    const audit = {
      record: auditRecord,
    } as unknown as HealthAuditService;
    const storageRead = jest.fn().mockResolvedValue(Buffer.from('%PDF-test'));
    const storageStore = jest.fn();
    const storageRemove = jest.fn();
    const storage = {
      read: storageRead,
      store: storageStore,
      remove: storageRemove,
    } as unknown as DocumentStorageService;
    return {
      service: new DocumentsService(prisma, access, audit, storage, {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService),
      requireAssignedPatient,
      getPatientForUser,
      auditRecord,
      storageRead,
      storageStore,
      storageRemove,
    };
  }

  it('checks active assignment and patient ownership before doctor download', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const transaction = { healthDocument: { findFirst } };
    const { service, requireAssignedPatient, storageRead } =
      createService(transaction);

    await expect(
      service.downloadForDoctor('doctor-user', 'patient-1', 'document-1'),
    ).rejects.toEqual(new NotFoundException('Document not found'));

    expect(requireAssignedPatient).toHaveBeenCalledWith(
      'doctor-user',
      'patient-1',
      transaction,
      'DOCUMENTS',
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'document-1',
          patientId: 'patient-1',
          deletionPendingAt: null,
        },
      }),
    );
    expect(storageRead).not.toHaveBeenCalled();
  });

  it('returns only public document metadata with a virtual available status', async () => {
    const document = {
      id: 'document-1',
      title: 'Report',
      category: 'MEDICAL_REPORT',
      description: null,
      documentDate: null,
      originalFileName: 'report.pdf',
      contentType: 'application/pdf',
      sizeBytes: 50,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const transaction = {
      healthDocument: { findMany: jest.fn().mockResolvedValue([document]) },
    };
    const { service } = createService(transaction);

    const result = await service.listForDoctor('doctor-user', 'patient-1');

    expect(result).toEqual([{ ...document, status: 'AVAILABLE' }]);
    expect(result[0]).not.toHaveProperty('storageKey');
    expect(result[0]).not.toHaveProperty('sha256');
    expect(transaction.healthDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientId: 'patient-1', deletionPendingAt: null },
      }),
    );
  });

  it('does not record a successful download when stored bytes cannot be read', async () => {
    const transaction = {
      healthDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'document-1',
          storageKey: 'a'.repeat(64),
          sha256: 'b'.repeat(64),
          originalFileName: 'report.pdf',
          contentType: 'application/pdf',
        }),
      },
    };
    const { service, storageRead, auditRecord } = createService(transaction);
    storageRead.mockRejectedValue(new Error('storage unavailable'));

    await expect(
      service.downloadForPatient('patient-user', 'document-1'),
    ).rejects.toThrow('storage unavailable');

    expect(auditRecord).not.toHaveBeenCalled();
  });

  it('removes a stored upload when the metadata transaction fails', async () => {
    const transaction = {
      healthDocument: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0 },
          _sum: { sizeBytes: 0 },
        }),
        create: jest.fn().mockRejectedValue(new Error('database unavailable')),
      },
    };
    const { service, storageStore, storageRemove } = createService(transaction);
    storageStore.mockResolvedValue({
      storageKey: 'a'.repeat(64),
      originalFileName: 'report.pdf',
      contentType: 'application/pdf',
      sizeBytes: 20,
      sha256: 'b'.repeat(64),
    });

    await expect(
      service.upload(
        'patient-user',
        { title: 'Report', category: HealthDocumentCategory.MEDICAL_REPORT },
        {
          originalname: 'report.pdf',
          mimetype: 'application/pdf',
          size: 20,
          buffer: Buffer.from('%PDF-test'),
        },
      ),
    ).rejects.toThrow('database unavailable');
    expect(storageRemove).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('enforces the per-patient storage quota inside the metadata transaction', async () => {
    const create = jest.fn();
    const aggregate = jest.fn().mockResolvedValue({
      _count: { _all: 500 },
      _sum: { sizeBytes: 100 },
    });
    const transaction = {
      healthDocument: {
        aggregate,
        create,
      },
    };
    const { service, storageStore, storageRemove } = createService(transaction);
    storageStore.mockResolvedValue({
      storageKey: 'a'.repeat(64),
      originalFileName: 'report.pdf',
      contentType: 'application/pdf',
      sizeBytes: 20,
      sha256: 'b'.repeat(64),
    });

    await expect(
      service.upload(
        'patient-user',
        { title: 'Report', category: HealthDocumentCategory.MEDICAL_REPORT },
        {
          originalname: 'report.pdf',
          mimetype: 'application/pdf',
          size: 20,
          buffer: Buffer.from('%PDF-test'),
        },
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    expect(create).not.toHaveBeenCalled();
    expect(storageRemove).toHaveBeenCalledWith('a'.repeat(64));
    expect(aggregate).toHaveBeenNthCalledWith(1, {
      where: { patientId: 'patient-1' },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });
    expect(aggregate).toHaveBeenNthCalledWith(2, {
      _sum: { sizeBytes: true },
    });
  });

  it('claims a document before removing its bytes and metadata', async () => {
    const transaction = {
      healthDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'document-1',
          patientId: 'patient-1',
          storageKey: 'a'.repeat(64),
          deletionPendingAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { service, storageRemove, auditRecord } = createService(transaction);

    await expect(
      service.remove('patient-user', 'document-1'),
    ).resolves.toBeUndefined();

    expect(transaction.healthDocument.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'document-1',
        patientId: 'patient-1',
        deletionPendingAt: null,
      },
      data: { deletionPendingAt: expect.any(Date) as Date },
    });
    expect(storageRemove).toHaveBeenCalledWith('a'.repeat(64));
    expect(transaction.healthDocument.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'document-1',
        patientId: 'patient-1',
        deletionPendingAt: { not: null },
      },
    });
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'HEALTH_DOCUMENT_DELETE_REQUESTED' }),
      transaction,
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'HEALTH_DOCUMENT_DELETED' }),
      transaction,
    );
  });

  it('leaves the durable deletion claim for reconciliation when storage fails', async () => {
    const deleteMany = jest.fn();
    const transaction = {
      healthDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'document-1',
          patientId: 'patient-1',
          storageKey: 'a'.repeat(64),
          deletionPendingAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany,
      },
    };
    const { service, storageRemove } = createService(transaction);
    storageRemove.mockRejectedValue(new Error('storage unavailable'));

    await expect(service.remove('patient-user', 'document-1')).rejects.toThrow(
      'storage unavailable',
    );

    expect(transaction.healthDocument.updateMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('reconciles pending deletion tombstones idempotently', async () => {
    const transaction = {
      healthDocument: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const pending = {
      id: 'document-1',
      patientId: 'patient-1',
      storageKey: 'a'.repeat(64),
    };
    const findMany = jest.fn().mockResolvedValue([pending]);
    const { service, storageRemove, auditRecord } = createService(transaction, {
      healthDocument: { findMany },
    });

    await expect(service.processPendingDeletions()).resolves.toEqual({
      completed: 1,
      failed: 0,
    });
    expect(storageRemove).toHaveBeenCalledWith(pending.storageKey);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: undefined,
        action: 'HEALTH_DOCUMENT_DELETED',
      }),
      transaction,
    );
  });
});
