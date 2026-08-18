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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AppointmentActor, AppointmentsService } from './appointments.service';
import { AppointmentQueryDto } from './dto/appointment-query.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

interface AuthenticatedAppointmentRequest extends Request {
  user: AppointmentActor;
}

@Controller('appointments')
@ApiTags('appointments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List role-scoped appointments' })
  @ApiOkResponse({ description: 'Paginated appointments' })
  findAll(
    @Req() request: AuthenticatedAppointmentRequest,
    @Query() query: AppointmentQueryDto,
  ) {
    return this.appointmentsService.findAll(request.user, query);
  }

  @Get('doctors')
  @ApiOperation({ summary: 'List active doctors available for scheduling' })
  @ApiOkResponse({ description: 'Available doctor profiles' })
  listAvailableDoctors(@Req() request: AuthenticatedAppointmentRequest) {
    return this.appointmentsService.listAvailableDoctors(request.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a role-scoped appointment' })
  @ApiOkResponse({ description: 'Appointment details' })
  @ApiNotFoundResponse({ description: 'Authorized appointment not found' })
  findOne(
    @Req() request: AuthenticatedAppointmentRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.appointmentsService.findOne(request.user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Schedule an authorized appointment' })
  @ApiCreatedResponse({ description: 'Appointment scheduled' })
  create(
    @Req() request: AuthenticatedAppointmentRequest,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.create(request.user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an authorized scheduled appointment' })
  @ApiOkResponse({ description: 'Appointment updated' })
  update(
    @Req() request: AuthenticatedAppointmentRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.update(request.user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel an appointment or delete it as an administrator',
  })
  @ApiNoContentResponse({ description: 'Appointment cancelled or deleted' })
  remove(
    @Req() request: AuthenticatedAppointmentRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.appointmentsService.remove(request.user, id);
  }
}
