import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { CreateEmergencyEventDto } from './dto/emergency-event.dto';
import { EmergencyEventsService } from './emergency-events.service';

interface EmergencyRequest extends Request {
  user: { id: string; role: UserRole };
}

@ApiTags('patient')
@ApiBearerAuth('access-token')
@Controller('emergency-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class EmergencyEventsController {
  constructor(private readonly emergencies: EmergencyEventsService) {}

  @Get()
  @ApiOperation({ summary: 'Get personal emergency-mode status and history' })
  @ApiOkResponse({
    description: 'Active event, recent events, contacts, and safety guidance',
  })
  findAll(@Req() request: EmergencyRequest) {
    return this.emergencies.findForPatient(request.user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Activate the non-diagnostic “I feel unwell” emergency mode',
  })
  @ApiCreatedResponse({
    description: 'Emergency event recorded and notifications enqueued',
  })
  @ApiConflictResponse({ description: 'Emergency mode is already active' })
  @ApiBadRequestResponse({ description: 'Invalid location or payload' })
  activate(
    @Req() request: EmergencyRequest,
    @Body() dto: CreateEmergencyEventDto,
  ) {
    return this.emergencies.activate(request.user.id, dto);
  }

  @Patch(':eventId/resolve')
  @ApiOperation({ summary: 'Resolve the current personal emergency event' })
  @ApiOkResponse({ description: 'Emergency event resolved' })
  @ApiNotFoundResponse({ description: 'Active emergency event not found' })
  resolve(
    @Req() request: EmergencyRequest,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    return this.emergencies.resolve(request.user.id, eventId);
  }
}
