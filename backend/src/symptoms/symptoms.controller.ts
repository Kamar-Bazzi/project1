import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSymptomDto, UpdateSymptomDto } from './dto/symptom.dto';
import { SymptomsService } from './symptoms.service';

interface SymptomRequest extends Request {
  user: { id: string };
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('symptoms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class SymptomsController {
  constructor(private readonly symptoms: SymptomsService) {}

  @Get()
  list(@Req() request: SymptomRequest) {
    return this.symptoms.listForPatient(request.user.id);
  }

  @Get(':symptomId')
  get(
    @Req() request: SymptomRequest,
    @Param('symptomId', new ParseUUIDPipe({ version: '4' })) symptomId: string,
  ) {
    return this.symptoms.findOne(request.user.id, symptomId);
  }

  @Post()
  create(@Req() request: SymptomRequest, @Body() dto: CreateSymptomDto) {
    return this.symptoms.create(request.user.id, dto);
  }

  @Patch(':symptomId')
  update(
    @Req() request: SymptomRequest,
    @Param('symptomId', new ParseUUIDPipe({ version: '4' })) symptomId: string,
    @Body() dto: UpdateSymptomDto,
  ) {
    return this.symptoms.update(request.user.id, symptomId, dto);
  }

  @Delete(':symptomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Req() request: SymptomRequest,
    @Param('symptomId', new ParseUUIDPipe({ version: '4' })) symptomId: string,
  ) {
    return this.symptoms.remove(request.user.id, symptomId);
  }
}

@ApiTags('doctor')
@ApiBearerAuth('access-token')
@Controller('doctor/patients/:patientId/symptoms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorSymptomsController {
  constructor(private readonly symptoms: SymptomsService) {}

  @Get()
  list(
    @Req() request: SymptomRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
  ) {
    return this.symptoms.listForDoctor(request.user.id, patientId);
  }
}
