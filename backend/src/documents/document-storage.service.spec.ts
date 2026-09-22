import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  DocumentStorageService,
  MAX_DOCUMENT_SIZE_BYTES,
} from './document-storage.service';
import { DocumentMalwareScannerService } from './document-malware-scanner.service';

describe('DocumentStorageService', () => {
  let storagePath: string;
  let service: DocumentStorageService;
  let assertClean: jest.Mock;

  beforeEach(async () => {
    storagePath = await mkdtemp(join(tmpdir(), 'caretrack-documents-'));
    assertClean = jest.fn().mockResolvedValue(undefined);
    service = new DocumentStorageService(
      {
        get: jest.fn().mockReturnValue(storagePath),
      } as unknown as ConfigService,
      { assertClean } as unknown as DocumentMalwareScannerService,
    );
  });

  afterEach(async () => {
    const resolvedTemp = `${resolve(tmpdir())}${process.platform === 'win32' ? '\\' : '/'}`;
    if (resolve(storagePath).startsWith(resolvedTemp)) {
      await rm(storagePath, { recursive: true, force: true });
    }
  });

  it('stores a validated PDF under an opaque key and canonical extension', async () => {
    const buffer = Buffer.from('%PDF-1.7\nclinical document');

    const stored = await service.store({
      originalname: '../unsafe/report.exe',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    });

    expect(stored.storageKey).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.originalFileName).toBe('report.pdf');
    expect(stored.sha256).toBe(
      createHash('sha256').update(buffer).digest('hex'),
    );
    expect(assertClean).toHaveBeenCalledWith(buffer);
    await expect(
      service.read(stored.storageKey, stored.sha256),
    ).resolves.toEqual(buffer);
  });

  it('does not persist a document when malware scanning blocks it', async () => {
    const scanFailure = new BadRequestException(
      'The document was rejected because malware was detected',
    );
    assertClean.mockRejectedValue(scanFailure);

    await expect(
      service.store({
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        size: 20,
        buffer: Buffer.from('%PDF-1.7\ntest'),
      }),
    ).rejects.toBe(scanFailure);
    await expect(readdir(storagePath)).resolves.toEqual([]);
  });

  it('rejects a MIME declaration that does not match the file signature', async () => {
    await expect(
      service.store({
        originalname: 'fake.pdf',
        mimetype: 'application/pdf',
        size: 12,
        buffer: Buffer.from('<html>bad</html>'),
      }),
    ).rejects.toEqual(
      new BadRequestException(
        'File content must match an allowed PDF, JPEG, or PNG type',
      ),
    );
  });

  it('rejects files over ten megabytes even when called outside Multer', async () => {
    const buffer = Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES + 1);
    buffer.write('%PDF-');
    await expect(
      service.store({
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      }),
    ).rejects.toEqual(
      new BadRequestException('Document files cannot exceed 10 MB'),
    );
  });

  it('rejects traversal and non-generated storage keys', async () => {
    await expect(service.read('../../patient-record.pdf')).rejects.toEqual(
      new InternalServerErrorException('Invalid document storage key'),
    );
  });

  it('refuses to serve a file whose stored hash no longer matches', async () => {
    const buffer = Buffer.from('%PDF-1.7\nclinical document');
    const stored = await service.store({
      originalname: 'report.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    });

    await expect(
      service.read(stored.storageKey, '0'.repeat(64)),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('removes stored bytes idempotently for deletion reconciliation', async () => {
    const buffer = Buffer.from('%PDF-1.7\nclinical document');
    const stored = await service.store({
      originalname: 'report.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    });

    await expect(service.remove(stored.storageKey)).resolves.toBeUndefined();
    await expect(service.remove(stored.storageKey)).resolves.toBeUndefined();
    await expect(service.read(stored.storageKey)).rejects.toThrow(
      'Document file not found',
    );
  });
});
