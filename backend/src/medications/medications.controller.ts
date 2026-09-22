import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { MedicationQueryDto } from './dto/medication-query.dto';
import { UpdateMedicationLogStatusDto } from './dto/update-medication-log-status.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { UpdateMedicationRefillDto } from './dto/update-medication-refill.dto';
import { MedicationRefillsService } from './medication-refills.service';
import { MedicationsService } from './medications.service';
import { MedicationInteractionsService } from '../medication-interactions/medication-interactions.service';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
  };
}

@Controller('medications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class MedicationsController {
  constructor(
    private readonly medicationsService: MedicationsService,
    private readonly refills: MedicationRefillsService,
    private readonly interactions: MedicationInteractionsService,
  ) {}

  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Headers('x-time-zone') timeZone?: string,
  ) {
    return this.medicationsService.findAll(request.user.id, timeZone);
  }

  @Get('interactions')
  checkInteractions(@Req() request: AuthenticatedRequest) {
    return this.interactions.checkForPatient(request.user.id);
  }

  @Get('paged')
  findPage(
    @Req() request: AuthenticatedRequest,
    @Query() query: MedicationQueryDto,
    @Headers('x-time-zone') timeZone?: string,
  ) {
    return this.medicationsService.findPage(request.user.id, query, timeZone);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) medicationId: string,
    @Headers('x-time-zone') timeZone?: string,
  ) {
    return this.medicationsService.findOne(
      request.user.id,
      medicationId,
      timeZone,
    );
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() createMedicationDto: CreateMedicationDto,
    @Headers('x-time-zone') timeZone?: string,
  ) {
    return this.medicationsService.create(
      request.user.id,
      createMedicationDto,
      timeZone,
    );
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) medicationId: string,
    @Body() updateMedicationDto: UpdateMedicationDto,
    @Headers('x-time-zone') timeZone?: string,
  ) {
    return this.medicationsService.update(
      request.user.id,
      medicationId,
      updateMedicationDto,
      timeZone,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) medicationId: string,
  ) {
    return this.medicationsService.remove(request.user.id, medicationId);
  }

  @Patch(':medicationId/logs/:logId/status')
  updateLogStatus(
    @Req() request: AuthenticatedRequest,
    @Param('medicationId', new ParseUUIDPipe({ version: '4' }))
    medicationId: string,
    @Param('logId', new ParseUUIDPipe({ version: '4' })) logId: string,
    @Body() updateStatusDto: UpdateMedicationLogStatusDto,
  ) {
    return this.medicationsService.updateLogStatus(
      request.user.id,
      medicationId,
      logId,
      updateStatusDto,
    );
  }

  @Patch(':id/refill')
  updateRefill(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) medicationId: string,
    @Body() dto: UpdateMedicationRefillDto,
    @Headers('x-time-zone') timeZone?: string,
  ) {
    return this.refills.update(request.user.id, medicationId, dto, timeZone);
  }
}
