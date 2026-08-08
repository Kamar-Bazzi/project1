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
import { CreateWearableDto } from './dto/create-wearable.dto';
import { UpdateWearableDto } from './dto/update-wearable.dto';
import { WearablesService } from './wearables.service';

interface AuthenticatedPatientRequest extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('wearables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class WearablesController {
  constructor(private readonly wearablesService: WearablesService) {}

  @Post()
  create(
    @Req() request: AuthenticatedPatientRequest,
    @Body() createDto: CreateWearableDto,
  ) {
    return this.wearablesService.createForPatient(request.user.id, createDto);
  }

  @Get()
  findAll(@Req() request: AuthenticatedPatientRequest) {
    return this.wearablesService.findAllForPatient(request.user.id);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deviceId: string,
  ) {
    return this.wearablesService.findOneForPatient(request.user.id, deviceId);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deviceId: string,
    @Body() updateDto: UpdateWearableDto,
  ) {
    return this.wearablesService.updateForPatient(
      request.user.id,
      deviceId,
      updateDto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deviceId: string,
  ) {
    return this.wearablesService.disconnectForPatient(
      request.user.id,
      deviceId,
    );
  }
}
