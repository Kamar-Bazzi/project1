import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WellnessService } from './wellness.service';

interface WellnessRequest extends Request {
  user: { id: string };
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('wellness')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class WellnessController {
  constructor(private readonly wellness: WellnessService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Get a transparent, non-diagnostic wellness summary',
  })
  summary(@Req() request: WellnessRequest) {
    return this.wellness.summary(request.user.id);
  }
}
