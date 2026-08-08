import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { PatientsService } from './patients.service';

interface AuthenticatedPatientRequest extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('me')
  getMyProfile(@Req() request: AuthenticatedPatientRequest) {
    return this.patientsService.getMyProfile(request.user.id);
  }

  @Patch('me')
  updateMyProfile(
    @Req() request: AuthenticatedPatientRequest,
    @Body() updateDto: UpdatePatientProfileDto,
  ) {
    return this.patientsService.updateMyProfile(request.user.id, updateDto);
  }
}
