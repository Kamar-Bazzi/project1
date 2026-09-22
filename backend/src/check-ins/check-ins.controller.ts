import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CheckInsService } from './check-ins.service';
import {
  CheckInHistoryQueryDto,
  UpsertDailyCheckInDto,
} from './dto/check-in.dto';

interface CheckInRequest extends Request {
  user: { id: string };
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('check-ins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class CheckInsController {
  constructor(private readonly checkIns: CheckInsService) {}

  @Get()
  list(@Req() request: CheckInRequest, @Query() query: CheckInHistoryQueryDto) {
    return this.checkIns.listForPatient(request.user.id, query.limit);
  }

  @Get('today')
  today(
    @Req() request: CheckInRequest,
    @Headers('x-time-zone') timeZone?: string,
  ) {
    return this.checkIns.todayForPatient(request.user.id, timeZone);
  }

  @Put('today')
  upsertToday(
    @Req() request: CheckInRequest,
    @Body() dto: UpsertDailyCheckInDto,
    @Headers('x-time-zone') timeZone?: string,
  ) {
    return this.checkIns.upsertToday(request.user.id, dto, timeZone);
  }
}

@ApiTags('doctor')
@ApiBearerAuth('access-token')
@Controller('doctor/patients/:patientId/check-ins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorCheckInsController {
  constructor(private readonly checkIns: CheckInsService) {}

  @Get()
  list(
    @Req() request: CheckInRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Query() query: CheckInHistoryQueryDto,
  ) {
    return this.checkIns.listForDoctor(request.user.id, patientId, query.limit);
  }

  @Get('today')
  today(
    @Req() request: CheckInRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
  ) {
    return this.checkIns.todayForDoctor(request.user.id, patientId);
  }
}
