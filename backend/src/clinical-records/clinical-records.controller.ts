import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ClinicalRecordsService } from './clinical-records.service';
import {
  CreateDoctorNoteDto,
  CreatePatientFollowUpDto,
  UpdateDoctorNoteDto,
} from './dto/doctor-record.dto';

interface ClinicalRequest extends Request {
  user: { id: string; role: UserRole };
}

@ApiTags('doctor')
@ApiBearerAuth('access-token')
@Controller('doctor/patients/:patientId')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorClinicalRecordsController {
  constructor(private readonly records: ClinicalRecordsService) {}

  @Get('notes')
  @ApiOperation({ summary: 'List notes for an actively assigned patient' })
  @ApiOkResponse({ description: 'Paginated doctor notes' })
  @ApiNotFoundResponse({ description: 'Active patient assignment not found' })
  findNotes(
    @Req() request: ClinicalRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.records.findNotesForDoctor(
      request.user.id,
      patientId,
      query.page,
      query.pageSize,
    );
  }

  @Post('notes')
  @ApiOperation({ summary: 'Create a note for an actively assigned patient' })
  @ApiCreatedResponse({ description: 'Doctor note created' })
  createNote(
    @Req() request: ClinicalRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Body() dto: CreateDoctorNoteDto,
  ) {
    return this.records.createNote(request.user.id, patientId, dto);
  }

  @Patch('notes/:noteId')
  @ApiOperation({ summary: 'Update a note authored by the current doctor' })
  @ApiOkResponse({ description: 'Doctor note updated' })
  updateNote(
    @Req() request: ClinicalRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Param('noteId', new ParseUUIDPipe({ version: '4' })) noteId: string,
    @Body() dto: UpdateDoctorNoteDto,
  ) {
    return this.records.updateNote(request.user.id, patientId, noteId, dto);
  }

  @Get('follow-ups')
  @ApiOperation({ summary: 'List immutable patient follow-up records' })
  @ApiOkResponse({ description: 'Paginated follow-up records' })
  findFollowUps(
    @Req() request: ClinicalRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.records.findFollowUpsForDoctor(
      request.user.id,
      patientId,
      query.page,
      query.pageSize,
    );
  }

  @Post('follow-ups')
  @ApiOperation({
    summary: 'Append an immutable patient follow-up record',
    description:
      'Follow-up records are append-only and have no update or delete endpoint.',
  })
  @ApiCreatedResponse({ description: 'Follow-up record appended' })
  createFollowUp(
    @Req() request: ClinicalRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Body() dto: CreatePatientFollowUpDto,
  ) {
    return this.records.createFollowUp(request.user.id, patientId, dto);
  }
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('medical-records')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class PatientClinicalRecordsController {
  constructor(private readonly records: ClinicalRecordsService) {}

  @Get('notes')
  @ApiOperation({ summary: 'List doctor notes in the current patient record' })
  @ApiOkResponse({ description: 'Paginated doctor notes' })
  findNotes(
    @Req() request: ClinicalRequest,
    @Query() query: PaginationQueryDto,
  ) {
    return this.records.findNotesForPatient(
      request.user.id,
      query.page,
      query.pageSize,
    );
  }

  @Get('follow-ups')
  @ApiOperation({ summary: 'List immutable follow-up records' })
  @ApiOkResponse({ description: 'Paginated follow-up records' })
  findFollowUps(
    @Req() request: ClinicalRequest,
    @Query() query: PaginationQueryDto,
  ) {
    return this.records.findFollowUpsForPatient(
      request.user.id,
      query.page,
      query.pageSize,
    );
  }
}
