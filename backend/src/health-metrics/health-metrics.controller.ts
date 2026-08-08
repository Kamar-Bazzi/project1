import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateHealthMetricDto } from './dto/create-health-metric.dto';
import { HealthMetricsQueryDto } from './dto/health-metrics-query.dto';
import {
  DemoSyncDto,
  SyncHealthMetricsDto,
} from './dto/sync-health-metrics.dto';
import { HealthMetricsService } from './health-metrics.service';

interface AuthenticatedPatientRequest extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('health-metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class HealthMetricsController {
  constructor(private readonly healthMetricsService: HealthMetricsService) {}

  @Get()
  findAll(
    @Req() request: AuthenticatedPatientRequest,
    @Query() query: HealthMetricsQueryDto,
  ) {
    return this.healthMetricsService.findAllForPatient(request.user.id, query);
  }

  @Get('latest')
  findLatest(
    @Req() request: AuthenticatedPatientRequest,
    @Query() query: HealthMetricsQueryDto,
  ) {
    return this.healthMetricsService.findLatestForPatient(
      request.user.id,
      query,
    );
  }

  @Get('history')
  findHistory(
    @Req() request: AuthenticatedPatientRequest,
    @Query() query: HealthMetricsQueryDto,
  ) {
    return this.healthMetricsService.findHistoryForPatient(
      request.user.id,
      query,
    );
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(
    @Req() request: AuthenticatedPatientRequest,
    @Body() dto: CreateHealthMetricDto,
  ) {
    return this.healthMetricsService.createForPatient(request.user.id, dto);
  }

  @Post('sync')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  sync(
    @Req() request: AuthenticatedPatientRequest,
    @Body() dto: SyncHealthMetricsDto,
  ) {
    return this.healthMetricsService.syncForPatient(request.user.id, dto);
  }

  @Post('demo-sync')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  syncDemo(
    @Req() request: AuthenticatedPatientRequest,
    @Body() dto: DemoSyncDto,
  ) {
    return this.healthMetricsService.syncDemoForPatient(
      request.user.id,
      dto.wearableDeviceId,
    );
  }
}
