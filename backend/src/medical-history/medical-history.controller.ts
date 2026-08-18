import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MedicalHistoryQueryDto } from './dto/medical-history-query.dto';
import { MedicalHistoryService } from './medical-history.service';

interface HistoryRequest extends Request {
  user: { id: string; role: UserRole };
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('medical-history')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class MedicalHistoryController {
  constructor(private readonly history: MedicalHistoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Get a unified, chronological personal medical history',
  })
  @ApiOkResponse({ description: 'Paginated unified timeline' })
  findForPatient(
    @Req() request: HistoryRequest,
    @Query() query: MedicalHistoryQueryDto,
  ) {
    return this.history.findForPatient(request.user.id, query);
  }
}

@ApiTags('doctor')
@ApiBearerAuth('access-token')
@Controller('doctor/patients/:patientId/medical-history')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorMedicalHistoryController {
  constructor(private readonly history: MedicalHistoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Get an assigned patient unified medical history',
  })
  @ApiOkResponse({ description: 'Paginated unified timeline' })
  @ApiNotFoundResponse({ description: 'Active patient assignment not found' })
  findForDoctor(
    @Req() request: HistoryRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Query() query: MedicalHistoryQueryDto,
  ) {
    return this.history.findForDoctor(request.user.id, patientId, query);
  }
}
