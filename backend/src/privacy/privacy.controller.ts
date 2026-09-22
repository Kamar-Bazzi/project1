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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
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
  CancelAccountDeletionDto,
  RequestAccountDeletionDto,
  RequestPatientDataExportDto,
} from './dto/privacy.dto';
import { PrivacyService } from './privacy.service';

interface PrivacyRequest extends Request {
  user: { id: string; role: UserRole };
}

@ApiTags('patient', 'privacy')
@ApiBearerAuth('access-token')
@Controller('privacy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('account-deletion')
  @ApiOperation({ summary: 'Get the current account-deletion request status' })
  @ApiOkResponse({ description: 'Current deletion request or NONE' })
  getAccountDeletionStatus(@Req() request: PrivacyRequest) {
    return this.privacy.getAccountDeletionStatus(request.user.id);
  }

  @Post('account-deletion')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Request account deletion after a cancellable grace period',
  })
  @ApiAcceptedResponse({ description: 'Deletion request and scheduled date' })
  requestAccountDeletion(
    @Req() request: PrivacyRequest,
    @Body() dto: RequestAccountDeletionDto,
  ) {
    return this.privacy.requestAccountDeletion(request.user.id, dto);
  }

  @Post('account-deletion/cancel')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cancel a pending account-deletion request' })
  @ApiOkResponse({ description: 'Cancelled deletion request' })
  cancelAccountDeletion(
    @Req() request: PrivacyRequest,
    @Body() dto: CancelAccountDeletionDto,
  ) {
    return this.privacy.cancelAccountDeletion(request.user.id, dto);
  }

  @Post('data-exports')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Request a short-lived patient data export',
    description:
      'Creates an owner-scoped request without storing an extra copy of the exported health data.',
  })
  @ApiAcceptedResponse({ description: 'Ready export request and expiry time' })
  requestDataExport(
    @Req() request: PrivacyRequest,
    @Body() dto: RequestPatientDataExportDto,
  ) {
    return this.privacy.requestDataExport(request.user.id, dto);
  }

  @Get('data-exports')
  @ApiOperation({ summary: 'List recent data-export requests' })
  @ApiOkResponse({ description: 'At most 50 recent export requests' })
  listDataExportRequests(@Req() request: PrivacyRequest) {
    return this.privacy.listDataExportRequests(request.user.id);
  }

  @Get('data-exports/:requestId/download')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Download an unexpired, patient-owned data export' })
  @ApiProduces('text/csv', 'application/json', 'application/pdf')
  @ApiOkResponse({ description: 'Private patient-data attachment' })
  async downloadDataExport(
    @Req() request: PrivacyRequest,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.privacy.downloadDataExport(
      request.user.id,
      requestId,
    );
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Length', String(file.content.length));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    return new StreamableFile(file.content);
  }

  @Delete('data-exports/:requestId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a patient-owned data-export request' })
  @ApiNoContentResponse({ description: 'Export request revoked' })
  revokeDataExportRequest(
    @Req() request: PrivacyRequest,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ) {
    return this.privacy.revokeDataExportRequest(request.user.id, requestId);
  }
}
