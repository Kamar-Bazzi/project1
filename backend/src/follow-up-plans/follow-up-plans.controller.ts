import {
  Body,
  Controller,
  Get,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  CreateFollowUpPlanDto,
  CreateFollowUpTaskDto,
  UpdateFollowUpPlanDto,
  UpdateFollowUpTaskDto,
} from './dto/follow-up-plan.dto';
import { FollowUpPlansService } from './follow-up-plans.service';

interface FollowUpRequest extends Request {
  user: { id: string; role: UserRole };
}

@ApiTags('doctor')
@ApiBearerAuth('access-token')
@Controller('doctor/patients/:patientId/follow-up-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DOCTOR)
export class DoctorFollowUpPlansController {
  constructor(private readonly plans: FollowUpPlansService) {}

  @Get()
  @ApiOperation({ summary: 'List follow-up plans for an assigned patient' })
  @ApiOkResponse({ description: 'Paginated follow-up plans and tasks' })
  @ApiNotFoundResponse({ description: 'Active patient assignment not found' })
  findAll(
    @Req() request: FollowUpRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.plans.findForDoctor(
      request.user.id,
      patientId,
      query.page,
      query.pageSize,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create an assigned-patient follow-up plan' })
  @ApiCreatedResponse({ description: 'Follow-up plan created' })
  create(
    @Req() request: FollowUpRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Body() dto: CreateFollowUpPlanDto,
  ) {
    return this.plans.createPlan(request.user.id, patientId, dto);
  }

  @Patch(':planId')
  @ApiOperation({ summary: 'Update a follow-up plan authored by this doctor' })
  @ApiOkResponse({ description: 'Follow-up plan updated' })
  update(
    @Req() request: FollowUpRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Param('planId', new ParseUUIDPipe({ version: '4' })) planId: string,
    @Body() dto: UpdateFollowUpPlanDto,
  ) {
    return this.plans.updatePlan(request.user.id, patientId, planId, dto);
  }

  @Post(':planId/tasks')
  @ApiOperation({ summary: 'Add a task to a follow-up plan' })
  @ApiCreatedResponse({ description: 'Follow-up task created' })
  createTask(
    @Req() request: FollowUpRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Param('planId', new ParseUUIDPipe({ version: '4' })) planId: string,
    @Body() dto: CreateFollowUpTaskDto,
  ) {
    return this.plans.createTask(request.user.id, patientId, planId, dto);
  }

  @Patch(':planId/tasks/:taskId')
  @ApiOperation({ summary: 'Update a task on a doctor-authored plan' })
  @ApiOkResponse({ description: 'Follow-up task updated' })
  updateTask(
    @Req() request: FollowUpRequest,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @Param('planId', new ParseUUIDPipe({ version: '4' })) planId: string,
    @Param('taskId', new ParseUUIDPipe({ version: '4' })) taskId: string,
    @Body() dto: UpdateFollowUpTaskDto,
  ) {
    return this.plans.updateTask(
      request.user.id,
      patientId,
      planId,
      taskId,
      dto,
    );
  }
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('medical-records/follow-up-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class PatientFollowUpPlansController {
  constructor(private readonly plans: FollowUpPlansService) {}

  @Get()
  @ApiOperation({
    summary: 'List follow-up plans in the current patient record',
  })
  @ApiOkResponse({ description: 'Paginated follow-up plans and tasks' })
  findAll(@Req() request: FollowUpRequest, @Query() query: PaginationQueryDto) {
    return this.plans.findForPatient(
      request.user.id,
      query.page,
      query.pageSize,
    );
  }
}
