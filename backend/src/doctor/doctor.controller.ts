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

import { AppointmentsService } from '../appointments/appointments.service';
import { AppointmentQueryDto } from '../appointments/dto/appointment-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DoctorAlertQueryDto } from './dto/doctor-alert-query.dto';
import { DoctorPatientQueryDto } from './dto/doctor-patient-query.dto';
import { DoctorService } from './doctor.service';

interface AuthenticatedDoctorRequest extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('doctor')
@ApiTags('doctor')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorController {
  constructor(
    private readonly doctorService: DoctorService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get the current doctor clinical dashboard' })
  @ApiOkResponse({ description: 'Assigned-patient clinical dashboard' })
  getDashboard(@Req() request: AuthenticatedDoctorRequest) {
    return this.doctorService.getDashboard(request.user.id);
  }

  @Get('patients')
  @ApiOperation({ summary: 'List actively assigned patients' })
  @ApiOkResponse({ description: 'Paginated assigned patients' })
  findPatients(
    @Req() request: AuthenticatedDoctorRequest,
    @Query() query: DoctorPatientQueryDto,
  ) {
    return this.doctorService.findPatients(request.user.id, query);
  }

  @Get('patients/:patientId')
  @ApiOperation({ summary: 'Get an actively assigned patient record' })
  @ApiOkResponse({ description: 'Assigned patient clinical record' })
  @ApiNotFoundResponse({ description: 'Active patient assignment not found' })
  findPatient(
    @Req() request: AuthenticatedDoctorRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
  ) {
    return this.doctorService.findPatient(request.user.id, patientId);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'List alerts for actively assigned patients' })
  @ApiOkResponse({ description: 'Paginated assigned-patient alerts' })
  findAlerts(
    @Req() request: AuthenticatedDoctorRequest,
    @Query() query: DoctorAlertQueryDto,
  ) {
    return this.doctorService.findAlerts(request.user.id, query);
  }

  @Get('appointments')
  @ApiOperation({ summary: 'List assigned-patient doctor appointments' })
  @ApiOkResponse({ description: 'Paginated doctor appointments' })
  findAppointments(
    @Req() request: AuthenticatedDoctorRequest,
    @Query() query: AppointmentQueryDto,
  ) {
    return this.appointmentsService.findAll(request.user, query);
  }
}
