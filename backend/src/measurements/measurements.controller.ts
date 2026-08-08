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
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { UpdateMeasurementDto } from './dto/update-measurement.dto';
import { MeasurementsService } from './measurements.service';

interface AuthenticatedPatientRequest extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('measurements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class MeasurementsController {
  constructor(private readonly measurementsService: MeasurementsService) {}

  @Get()
  findAll(@Req() request: AuthenticatedPatientRequest) {
    return this.measurementsService.findAllForPatient(request.user.id);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.measurementsService.findOneForPatient(request.user.id, id);
  }

  @Post()
  create(
    @Req() request: AuthenticatedPatientRequest,
    @Body() createDto: CreateMeasurementDto,
  ) {
    return this.measurementsService.createForPatient(
      request.user.id,
      createDto,
    );
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateDto: UpdateMeasurementDto,
  ) {
    return this.measurementsService.updateForPatient(
      request.user.id,
      id,
      updateDto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.measurementsService.deleteForPatient(request.user.id, id);
  }
}
