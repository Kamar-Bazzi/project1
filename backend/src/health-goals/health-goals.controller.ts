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
import {
  CreateHealthGoalDto,
  CreateHealthGoalProgressDto,
  HealthGoalQueryDto,
  UpdateHealthGoalDto,
} from './dto/health-goal.dto';
import { HealthGoalsService } from './health-goals.service';

interface GoalRequest extends Request {
  user: { id: string; role: UserRole };
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('health-goals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class HealthGoalsController {
  constructor(private readonly goals: HealthGoalsService) {}

  @Get()
  @ApiOperation({ summary: 'List personal health goals and progress' })
  @ApiOkResponse({ description: 'Health goals with calculated progress' })
  findAll(@Req() request: GoalRequest, @Query() query: HealthGoalQueryDto) {
    return this.goals.findForPatient(request.user.id, query);
  }

  @Get(':goalId')
  @ApiOperation({ summary: 'Get a personal health goal' })
  @ApiOkResponse({ description: 'Health goal with recent progress' })
  findOne(
    @Req() request: GoalRequest,
    @Param('goalId', new ParseUUIDPipe({ version: '4' })) goalId: string,
  ) {
    return this.goals.findOne(request.user.id, goalId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a personal health goal' })
  @ApiCreatedResponse({ description: 'Health goal created' })
  create(@Req() request: GoalRequest, @Body() dto: CreateHealthGoalDto) {
    return this.goals.create(request.user.id, dto);
  }

  @Patch(':goalId')
  @ApiOperation({ summary: 'Update a personal health goal' })
  @ApiOkResponse({ description: 'Health goal updated' })
  update(
    @Req() request: GoalRequest,
    @Param('goalId', new ParseUUIDPipe({ version: '4' })) goalId: string,
    @Body() dto: UpdateHealthGoalDto,
  ) {
    return this.goals.update(request.user.id, goalId, dto);
  }

  @Delete(':goalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a personal health goal' })
  @ApiNoContentResponse({ description: 'Health goal cancelled' })
  cancel(
    @Req() request: GoalRequest,
    @Param('goalId', new ParseUUIDPipe({ version: '4' })) goalId: string,
  ) {
    return this.goals.cancel(request.user.id, goalId);
  }

  @Post(':goalId/progress')
  @ApiOperation({ summary: 'Record progress for a personal health goal' })
  @ApiCreatedResponse({ description: 'Progress record created' })
  addProgress(
    @Req() request: GoalRequest,
    @Param('goalId', new ParseUUIDPipe({ version: '4' })) goalId: string,
    @Body() dto: CreateHealthGoalProgressDto,
  ) {
    return this.goals.addProgress(request.user.id, goalId, dto);
  }
}

@ApiTags('doctor')
@ApiBearerAuth('access-token')
@Controller('doctor/patients/:patientId/goals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorHealthGoalsController {
  constructor(private readonly goals: HealthGoalsService) {}

  @Get()
  @ApiOperation({ summary: 'List an actively assigned patient health goals' })
  @ApiOkResponse({ description: 'Patient health goals with progress' })
  @ApiNotFoundResponse({ description: 'Active patient assignment not found' })
  findAll(
    @Req() request: GoalRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Query() query: HealthGoalQueryDto,
  ) {
    return this.goals.findForDoctor(request.user.id, patientId, query);
  }
}
