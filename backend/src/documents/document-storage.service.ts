import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';

import { DocumentMalwareScannerService } from './document-malware-scanner.service';

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

const STORAGE_KEY_PATTERN = /^[a-f0-9]{64}$/;
const MIME_EXTENSIONS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
} as const;

type AllowedDocumentMime = keyof typeof MIME_EXTENSIONS;

export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StoredDocumentFile {
  storageKey: string;
  originalFileName: string;
  contentType: AllowedDocumentMime;
  sizeBytes: number;
  sha256: string;
}

@Injectable()
export class DocumentStorageService {
  private readonly storageRoot: string;

  constructor(
    config: ConfigService,
    private readonly malwareScanner: DocumentMalwareScannerService,
  ) {
    this.storageRoot = resolve(
      config.get<string>('DOCUMENT_STORAGE_PATH') ??
        join(process.cwd(), 'storage', 'documents'),
    );
  }

  async store(
    file: UploadedDocumentFile | undefined,
  ): Promise<StoredDocumentFile> {
    if (!file?.buffer) {
      throw new BadRequestException('A document file is required');
    }
    if (file.buffer.length === 0) {
      throw new BadRequestException('The document file cannot be empty');
    }
    if (file.buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException('Document files cannot exceed 10 MB');
    }

    const detectedMime = this.detectMime(file.buffer);
    if (!detectedMime || detectedMime !== file.mimetype) {
      throw new BadRequestException(
        'File content must match an allowed PDF, JPEG, or PNG type',
      );
    }

    await this.malwareScanner.assertClean(file.buffer);

    await this.ensureStorageRoot();
    const storageKey = randomBytes(32).toString('hex');
    const storagePath = this.pathForKey(storageKey);
    try {
      await writeFile(storagePath, file.buffer, { flag: 'wx', mode: 0o600 });
    } catch {
      throw new InternalServerErrorException('Document storage unavailable');
    }

    return {
      storageKey,
      originalFileName: this.safeFileName(file.originalname, detectedMime),
      contentType: detectedMime,
      sizeBytes: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  async read(storageKey: string, expectedSha256?: string): Promise<Buffer> {
    try {
      const buffer = await readFile(this.pathForKey(storageKey));
      if (
        expectedSha256 &&
        createHash('sha256').update(buffer).digest('hex') !== expectedSha256
      ) {
        throw new InternalServerErrorException(
          'Document integrity check failed',
        );
      }
      return buffer;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      if (this.errorCode(error) === 'ENOENT') {
        throw new NotFoundException('Document file not found');
      }
      throw new InternalServerErrorException('Document storage unavailable');
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.pathForKey(storageKey));
    } catch (error) {
      if (this.errorCode(error) !== 'ENOENT') {
        throw new InternalServerErrorException('Document storage unavailable');
      }
    }
  }

  private async ensureStorageRoot(): Promise<void> {
    try {
      await mkdir(this.storageRoot, { recursive: true, mode: 0o700 });
    } catch {
      throw new InternalServerErrorException('Document storage unavailable');
    }
  }

  private pathForKey(storageKey: string): string {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new InternalServerErrorException('Invalid document storage key');
    }
    const storagePath = resolve(this.storageRoot, storageKey);
    if (!storagePath.startsWith(`${this.storageRoot}${sep}`)) {
      throw new InternalServerErrorException('Invalid document storage key');
    }
    return storagePath;
  }

  private detectMime(buffer: Buffer): AllowedDocumentMime | null {
    if (buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      return 'application/pdf';
    }
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }
    return null;
  }

  private safeFileName(
    originalName: string,
    mime: AllowedDocumentMime,
  ): string {
    const withoutControls = [
      ...basename((originalName || '').replace(/\\/g, '/')),
    ]
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('');
    const normalized = withoutControls.trim().slice(0, 240);
    const stem = normalized
      .replace(/\.[^.]*$/, '')
      .trim()
      .slice(0, 220);
    return `${stem || 'document'}.${MIME_EXTENSIONS[mime]}`;
  }

  private errorCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : undefined;
  }
}
