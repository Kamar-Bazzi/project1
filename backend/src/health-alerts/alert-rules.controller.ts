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
import { withoutPatientId } from '../common/responses/without-patient-id';
import { AlertRulesService } from './alert-rules.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

interface AuthenticatedPatientRequest extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('alert-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class AlertRulesController {
  constructor(private readonly alertRulesService: AlertRulesService) {}

  @Get()
  async findAll(@Req() request: AuthenticatedPatientRequest) {
    const rules = await this.alertRulesService.findAllForPatient(
      request.user.id,
    );

    return rules.map(withoutPatientId);
  }

  @Get(':id')
  async findOne(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const rule = await this.alertRulesService.findOneForPatient(
      request.user.id,
      id,
    );

    return withoutPatientId(rule);
  }

  @Post()
  async create(
    @Req() request: AuthenticatedPatientRequest,
    @Body() createDto: CreateAlertRuleDto,
  ) {
    const rule = await this.alertRulesService.createForPatient(
      request.user.id,
      createDto,
    );

    return withoutPatientId(rule);
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateDto: UpdateAlertRuleDto,
  ) {
    const rule = await this.alertRulesService.updateForPatient(
      request.user.id,
      id,
      updateDto,
    );

    return withoutPatientId(rule);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.alertRulesService.deleteForPatient(request.user.id, id);
  }
}
