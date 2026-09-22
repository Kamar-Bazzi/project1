import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  MAX_DOCUMENT_SIZE_BYTES,
  UploadedDocumentFile,
} from './document-storage.service';
import { DocumentDownload, DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

interface DocumentRequest extends Request {
  user: { id: string; role: UserRole };
}

const uploadInterceptor = FileInterceptor('file', {
  limits: {
    fileSize: MAX_DOCUMENT_SIZE_BYTES,
    files: 1,
    fields: 4,
    parts: 5,
  },
});

function contentDisposition(fileName: string): string {
  const fallback =
    fileName
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\;=]/g, '_')
      .slice(0, 180) || 'document';
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function streamDownload(
  download: DocumentDownload,
  response: Response,
): StreamableFile {
  response.setHeader('Content-Type', download.contentType);
  response.setHeader('Content-Length', download.buffer.length.toString());
  response.setHeader(
    'Content-Disposition',
    contentDisposition(download.fileName),
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  return new StreamableFile(download.buffer);
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class PatientDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List the current patient documents' })
  @ApiOkResponse({ description: 'Patient-owned document metadata' })
  findAll(@Req() request: DocumentRequest) {
    return this.documents.listForPatient(request.user.id);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title', 'category'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string', maxLength: 160 },
        category: {
          type: 'string',
          enum: [
            'PRESCRIPTION',
            'LABORATORY_REPORT',
            'MEDICAL_REPORT',
            'OTHER',
          ],
        },
        description: { type: 'string', maxLength: 2_000, nullable: true },
        documentDate: { type: 'string', format: 'date', nullable: true },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a private patient health document' })
  @ApiCreatedResponse({ description: 'Validated document metadata' })
  upload(
    @Req() request: DocumentRequest,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadedDocumentFile | undefined,
  ) {
    return this.documents.upload(request.user.id, dto, file);
  }

  @Get(':documentId/download')
  @ApiOperation({ summary: 'Download a current patient document' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiOkResponse({ description: 'Private document attachment' })
  @ApiNotFoundResponse({ description: 'Document not found in patient scope' })
  async download(
    @Req() request: DocumentRequest,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return streamDownload(
      await this.documents.downloadForPatient(request.user.id, documentId),
      response,
    );
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a current patient document' })
  @ApiNoContentResponse({ description: 'Document permanently deleted' })
  remove(
    @Req() request: DocumentRequest,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ) {
    return this.documents.remove(request.user.id, documentId);
  }
}

@ApiTags('doctor')
@ApiBearerAuth('access-token')
@Controller('doctor/patients/:patientId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List documents for an actively assigned patient' })
  @ApiOkResponse({ description: 'Assigned-patient document metadata' })
  @ApiNotFoundResponse({ description: 'Active patient assignment not found' })
  findAll(
    @Req() request: DocumentRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
  ) {
    return this.documents.listForDoctor(request.user.id, patientId);
  }

  @Get(':documentId/download')
  @ApiOperation({ summary: 'Download an assigned-patient document' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiOkResponse({ description: 'Private document attachment' })
  @ApiNotFoundResponse({
    description: 'Assignment or document not found in doctor scope',
  })
  async download(
    @Req() request: DocumentRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return streamDownload(
      await this.documents.downloadForDoctor(
        request.user.id,
        patientId,
        documentId,
      ),
      response,
    );
  }
}
