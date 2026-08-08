import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { withoutPatientId } from '../common/responses/without-patient-id';
import { HealthAlertQueryDto } from './dto/health-alert-query.dto';
import { HealthAlertsService } from './health-alerts.service';

interface AuthenticatedPatientRequest extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('health-alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class HealthAlertsController {
  constructor(private readonly healthAlertsService: HealthAlertsService) {}

  @Get()
  async findAll(
    @Req() request: AuthenticatedPatientRequest,
    @Query() query: HealthAlertQueryDto,
  ) {
    const alerts = await this.healthAlertsService.findAllForPatient(
      request.user.id,
      query,
    );

    return alerts.map(withoutPatientId);
  }

  @Get(':id')
  async findOne(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const alert = await this.healthAlertsService.findOneForPatient(
      request.user.id,
      id,
    );

    return withoutPatientId(alert);
  }

  @Patch(':id/acknowledge')
  async acknowledge(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const alert = await this.healthAlertsService.acknowledgeForPatient(
      request.user.id,
      id,
    );

    return withoutPatientId(alert);
  }

  @Patch(':id/resolve')
  async resolve(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const alert = await this.healthAlertsService.resolveForPatient(
      request.user.id,
      id,
    );

    return withoutPatientId(alert);
  }
}
