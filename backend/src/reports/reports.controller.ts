import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClinicalActor } from '../common/clinical-access/clinical-access.service';
import {
  ClinicalExportDataset,
  ClinicalExportQueryDto,
  HealthReportExportQueryDto,
  HealthReportQueryDto,
} from './dto/report-query.dto';
import {
  ClinicalExportFile,
  ClinicalExportsService,
} from './clinical-exports.service';
import { ReportsService } from './reports.service';

interface ReportRequest extends Request {
  user: ClinicalActor;
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exports: ClinicalExportsService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Get a 7, 30, or 90-day personal health report' })
  @ApiOkResponse({
    description:
      'Trends, adherence, alerts, goals, and descriptive unusual-change flags',
  })
  getHealthReport(
    @Req() request: ReportRequest,
    @Query() query: HealthReportQueryDto,
  ) {
    return this.reports.getPatientReport(request.user.id, query.period);
  }

  @Get('health/export')
  @ApiOperation({ summary: 'Export a personal health report as CSV or PDF' })
  @ApiProduces('text/csv', 'application/pdf')
  @ApiOkResponse({ description: 'CSV or PDF report bytes' })
  async exportHealthReport(
    @Req() request: ReportRequest,
    @Query() query: HealthReportExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.exports.exportHealthReport(
      request.user.id,
      query.period,
      query.format,
    );
    this.setDownloadHeaders(response, file);
    return file.content;
  }

  private setDownloadHeaders(response: Response, file: ClinicalExportFile) {
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }
}

@ApiTags('doctor')
@ApiBearerAuth('access-token')
@Controller('doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorMonitoringController {
  constructor(private readonly reports: ReportsService) {}

  @Get('monitoring')
  @ApiOperation({
    summary: 'Monitor assigned patients and unusual recorded-data changes',
  })
  @ApiOkResponse({
    description: 'Prioritized assigned-patient monitoring list',
  })
  getMonitoring(
    @Req() request: ReportRequest,
    @Query() query: HealthReportQueryDto,
  ) {
    return this.reports.getDoctorMonitoring(request.user.id, query.period);
  }

  @Get('patients/:patientId/monitoring')
  @ApiOperation({ summary: 'Get an assigned patient detailed trend report' })
  @ApiOkResponse({ description: 'Assigned patient 7, 30, or 90-day report' })
  @ApiNotFoundResponse({ description: 'Active patient assignment not found' })
  getPatientMonitoring(
    @Req() request: ReportRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Query() query: HealthReportQueryDto,
  ) {
    return this.reports.getDoctorPatientReport(
      request.user.id,
      patientId,
      query.period,
    );
  }
}

@ApiTags('patient', 'doctor', 'admin')
@ApiBearerAuth('access-token')
@Controller('exports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
export class ClinicalExportsController {
  constructor(private readonly exports: ClinicalExportsService) {}

  @Get(':dataset')
  @ApiOperation({
    summary: 'Export an authorized clinical dataset as CSV or PDF',
    description:
      'Patients export their own data. Doctors require an active patient assignment. Administrators must explicitly identify the patient.',
  })
  @ApiParam({ name: 'dataset', enum: ClinicalExportDataset })
  @ApiProduces('text/csv', 'application/pdf')
  @ApiOkResponse({ description: 'CSV or PDF export bytes' })
  async exportDataset(
    @Req() request: ReportRequest,
    @Param('dataset', new ParseEnumPipe(ClinicalExportDataset))
    dataset: ClinicalExportDataset,
    @Query() query: ClinicalExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.exports.exportDataset(request.user, dataset, query);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return file.content;
  }
}
