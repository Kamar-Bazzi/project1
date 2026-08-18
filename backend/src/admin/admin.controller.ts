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
import { AdminService } from './admin.service';
import { AdminDoctorQueryDto } from './dto/admin-doctor-query.dto';
import {
  AdminUserQueryDto,
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from './dto/admin-user.dto';
import { AssignmentQueryDto, CreateAssignmentDto } from './dto/assignment.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

interface AuthenticatedAdminRequest extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('admin')
@ApiTags('admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get the administrative operations dashboard' })
  @ApiOkResponse({ description: 'User, role, account, and audit summaries' })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('roles')
  @ApiOperation({ summary: 'List assignable user roles' })
  @ApiOkResponse({ description: 'Supported role options' })
  getRoleOptions() {
    return this.adminService.getRoleOptions();
  }

  @Get('users')
  @ApiOperation({ summary: 'Search and filter users' })
  @ApiOkResponse({ description: 'Paginated user accounts' })
  findUsers(@Query() query: AdminUserQueryDto) {
    return this.adminService.findUsers(query);
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Get a user account and role profile' })
  @ApiOkResponse({ description: 'User account details' })
  @ApiNotFoundResponse({ description: 'User not found' })
  findUser(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.adminService.findUser(userId);
  }

  @Post('users')
  @ApiOperation({ summary: 'Create a managed user account' })
  @ApiCreatedResponse({ description: 'User account created' })
  createUser(
    @Req() request: AuthenticatedAdminRequest,
    @Body() dto: CreateAdminUserDto,
  ) {
    return this.adminService.createUser(request.user.id, dto);
  }

  @Patch('users/:userId')
  @ApiOperation({ summary: 'Update role, profile, or account status' })
  @ApiOkResponse({ description: 'User account updated' })
  @ApiNotFoundResponse({ description: 'User not found' })
  updateUser(
    @Req() request: AuthenticatedAdminRequest,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.adminService.updateUser(request.user.id, userId, dto);
  }

  @Delete('users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable a managed user account' })
  @ApiNoContentResponse({ description: 'User account disabled' })
  disableUser(
    @Req() request: AuthenticatedAdminRequest,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.adminService.disableUser(request.user.id, userId);
  }

  @Get('doctors')
  @ApiOperation({ summary: 'Search doctor profiles and assignment counts' })
  @ApiOkResponse({ description: 'Paginated doctor profiles' })
  findDoctors(@Query() query: AdminDoctorQueryDto) {
    return this.adminService.findDoctors(query);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'List doctor-patient access assignments' })
  @ApiOkResponse({ description: 'Paginated access assignments' })
  findAssignments(@Query() query: AssignmentQueryDto) {
    return this.adminService.findAssignments(query);
  }

  @Post('assignments')
  @ApiOperation({ summary: 'Create or reactivate a doctor-patient assignment' })
  @ApiCreatedResponse({ description: 'Assignment activated' })
  createAssignment(
    @Req() request: AuthenticatedAdminRequest,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.adminService.createAssignment(request.user.id, dto);
  }

  @Delete('assignments/:doctorId/:patientId')
  @ApiOperation({ summary: 'Revoke a doctor-patient assignment' })
  @ApiOkResponse({ description: 'Assignment revoked' })
  revokeAssignment(
    @Req() request: AuthenticatedAdminRequest,
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
  ) {
    return this.adminService.revokeAssignment(
      request.user.id,
      doctorId,
      patientId,
    );
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Search security and clinical audit logs' })
  @ApiOkResponse({ description: 'Paginated audit events' })
  findAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.adminService.findAuditLogs(query);
  }
}
