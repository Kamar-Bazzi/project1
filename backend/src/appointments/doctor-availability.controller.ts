import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DoctorAvailabilityService } from './doctor-availability.service';
import { UpdateDoctorAvailabilityDto } from './dto/update-doctor-availability.dto';

interface AuthenticatedDoctorRequest extends Request {
  user: { id: string; role: UserRole };
}

@Controller('doctor/availability')
@ApiTags('appointments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorAvailabilityController {
  constructor(private readonly doctorAvailability: DoctorAvailabilityService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current doctor weekly availability' })
  @ApiOkResponse({ description: 'Doctor timezone, slot duration, and windows' })
  getMine(@Req() request: AuthenticatedDoctorRequest) {
    return this.doctorAvailability.getMine(request.user.id);
  }

  @Put()
  @ApiOperation({ summary: 'Replace the current doctor weekly availability' })
  @ApiOkResponse({ description: 'Updated doctor availability' })
  replaceMine(
    @Req() request: AuthenticatedDoctorRequest,
    @Body() dto: UpdateDoctorAvailabilityDto,
  ) {
    return this.doctorAvailability.replaceMine(request.user.id, dto);
  }
}
