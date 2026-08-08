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
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';
import { EmergencyContactsService } from './emergency-contacts.service';

interface AuthenticatedPatientRequest extends Request {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('emergency-contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class EmergencyContactsController {
  constructor(
    private readonly emergencyContactsService: EmergencyContactsService,
  ) {}

  @Get()
  async findAll(@Req() request: AuthenticatedPatientRequest) {
    const contacts = await this.emergencyContactsService.findAllForPatient(
      request.user.id,
    );

    return contacts.map(withoutPatientId);
  }

  @Get(':id')
  async findOne(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const contact = await this.emergencyContactsService.findOneForPatient(
      request.user.id,
      id,
    );

    return withoutPatientId(contact);
  }

  @Post()
  async create(
    @Req() request: AuthenticatedPatientRequest,
    @Body() createDto: CreateEmergencyContactDto,
  ) {
    const contact = await this.emergencyContactsService.createForPatient(
      request.user.id,
      createDto,
    );

    return withoutPatientId(contact);
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateDto: UpdateEmergencyContactDto,
  ) {
    const contact = await this.emergencyContactsService.updateForPatient(
      request.user.id,
      id,
      updateDto,
    );

    return withoutPatientId(contact);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() request: AuthenticatedPatientRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.emergencyContactsService.deleteForPatient(request.user.id, id);
  }
}
