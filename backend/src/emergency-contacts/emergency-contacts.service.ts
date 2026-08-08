import { Injectable, NotFoundException } from '@nestjs/common';
import { EmergencyContact, Prisma } from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class EmergencyContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HealthAuditService,
  ) {}

  async findAllForPatient(userId: string): Promise<EmergencyContact[]> {
    const patientId = await this.getPatientId(userId);
    const contacts = await this.prisma.emergencyContact.findMany({
      where: { patientId },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });

    await this.audit.record({
      userId,
      action: 'EMERGENCY_CONTACT_LIST_ACCESSED',
      entity: 'EmergencyContact',
      metadata: { patientId, count: contacts.length },
    });

    return contacts;
  }

  async findOneForPatient(
    userId: string,
    contactId: string,
  ): Promise<EmergencyContact> {
    const patientId = await this.getPatientId(userId);
    const contact = await this.prisma.emergencyContact.findFirst({
      where: { id: contactId, patientId },
    });

    if (!contact) {
      throw new NotFoundException('Emergency contact not found');
    }

    await this.audit.record({
      userId,
      action: 'EMERGENCY_CONTACT_ACCESSED',
      entity: 'EmergencyContact',
      entityId: contact.id,
      metadata: { patientId },
    });

    return contact;
  }

  async createForPatient(
    userId: string,
    createDto: CreateEmergencyContactDto,
  ): Promise<EmergencyContact> {
    const patientId = await this.getPatientId(userId);

    return this.runSerializableTransaction(async (transaction) => {
      const contact = await transaction.emergencyContact.create({
        data: {
          patientId,
          name: createDto.name,
          relationship: createDto.relationship,
          phone: createDto.phone,
          email: createDto.email ?? null,
          active: createDto.active,
        },
      });

      await this.audit.record(
        {
          userId,
          action: 'EMERGENCY_CONTACT_CREATED',
          entity: 'EmergencyContact',
          entityId: contact.id,
          metadata: { patientId, enabled: contact.active },
        },
        transaction,
      );

      return contact;
    });
  }

  async updateForPatient(
    userId: string,
    contactId: string,
    updateDto: UpdateEmergencyContactDto,
  ): Promise<EmergencyContact> {
    const patientId = await this.getPatientId(userId);

    return this.runSerializableTransaction(async (transaction) => {
      const existing = await transaction.emergencyContact.findFirst({
        where: { id: contactId, patientId },
      });

      if (!existing) {
        throw new NotFoundException('Emergency contact not found');
      }

      const data: Prisma.EmergencyContactUpdateInput = {};

      if (updateDto.name !== undefined) {
        data.name = updateDto.name;
      }
      if (updateDto.relationship !== undefined) {
        data.relationship = updateDto.relationship;
      }
      if (updateDto.phone !== undefined) {
        data.phone = updateDto.phone;
      }
      if (updateDto.email !== undefined) {
        data.email = updateDto.email;
      }
      if (updateDto.active !== undefined) {
        data.active = updateDto.active;
      }

      const contact =
        Object.keys(data).length === 0
          ? existing
          : await transaction.emergencyContact.update({
              where: { id: existing.id, patientId },
              data,
            });

      await this.audit.record(
        {
          userId,
          action: 'EMERGENCY_CONTACT_UPDATED',
          entity: 'EmergencyContact',
          entityId: contact.id,
          metadata: { patientId, enabled: contact.active },
        },
        transaction,
      );

      return contact;
    });
  }

  async deleteForPatient(userId: string, contactId: string): Promise<void> {
    const patientId = await this.getPatientId(userId);

    await this.runSerializableTransaction(async (transaction) => {
      const result = await transaction.emergencyContact.deleteMany({
        where: { id: contactId, patientId },
      });

      if (result.count === 0) {
        throw new NotFoundException('Emergency contact not found');
      }

      await this.audit.record(
        {
          userId,
          action: 'EMERGENCY_CONTACT_DELETED',
          entity: 'EmergencyContact',
          entityId: contactId,
          metadata: { patientId },
        },
        transaction,
      );
    });
  }

  private async getPatientId(userId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    return patient.id;
  }

  private async runSerializableTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const canRetry =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < SERIALIZABLE_TRANSACTION_ATTEMPTS;

        if (!canRetry) {
          throw error;
        }
      }
    }

    throw new Error(
      'Serializable emergency contact transaction retry exhausted',
    );
  }
}
