import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicationLogStatus, Prisma } from '@prisma/client';

import {
  canonicalizeIanaTimeZone,
  DEFAULT_TIME_ZONE,
} from '../common/validators/is-iana-time-zone.validator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

const patientProfileSelect = {
  id: true,
  userId: true,
  dateOfBirth: true,
  phoneNumber: true,
  emergencyContact: true,
  timeZone: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      name: true,
      email: true,
    },
  },
} satisfies Prisma.PatientSelect;

type PatientProfileRecord = Prisma.PatientGetPayload<{
  select: typeof patientProfileSelect;
}>;
const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

function getCalendarDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export interface PatientProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  dateOfBirth: string | null;
  phoneNumber: string | null;
  emergencyContact: string | null;
  timeZone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string): Promise<PatientProfile> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: patientProfileSelect,
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    await this.recordAudit(this.prisma, userId, 'MEDICAL_RECORD_ACCESSED', {
      entity: 'Patient',
      entityId: patient.id,
      patientId: patient.id,
      operation: 'PROFILE_READ',
    });
    return this.toPatientProfile(patient);
  }

  updateMyProfile(
    userId: string,
    updateDto: UpdatePatientProfileDto,
  ): Promise<PatientProfile> {
    const canonicalTimeZone =
      updateDto.timeZone === undefined
        ? undefined
        : canonicalizeIanaTimeZone(updateDto.timeZone);

    if (updateDto.timeZone !== undefined && canonicalTimeZone === null) {
      throw new BadRequestException('timeZone must be a valid IANA timezone');
    }

    return this.runSerializableTransaction(async (transaction) => {
      const existingPatient = await transaction.patient.findUnique({
        where: { userId },
        select: { id: true, timeZone: true },
      });

      if (!existingPatient) {
        throw new NotFoundException('Patient profile not found');
      }

      if (updateDto.dateOfBirth) {
        const effectiveTimeZone =
          canonicalTimeZone ??
          canonicalizeIanaTimeZone(existingPatient.timeZone) ??
          DEFAULT_TIME_ZONE;
        const today = getCalendarDateInTimeZone(new Date(), effectiveTimeZone);

        if (updateDto.dateOfBirth > today) {
          throw new BadRequestException(
            "dateOfBirth cannot be in the future in the patient's timezone",
          );
        }
      }

      if (updateDto.name !== undefined) {
        await transaction.user.update({
          where: { id: userId },
          data: { name: updateDto.name },
        });
      }

      const patientData: Prisma.PatientUpdateInput = {};

      if (updateDto.dateOfBirth !== undefined) {
        patientData.dateOfBirth =
          updateDto.dateOfBirth === null
            ? null
            : new Date(`${updateDto.dateOfBirth}T00:00:00.000Z`);
      }

      if (updateDto.phoneNumber !== undefined) {
        patientData.phoneNumber = updateDto.phoneNumber;
      }

      if (updateDto.emergencyContact !== undefined) {
        patientData.emergencyContact = updateDto.emergencyContact;
      }

      if (updateDto.timeZone !== undefined) {
        patientData.timeZone = canonicalTimeZone;
      }

      if (
        updateDto.name !== undefined &&
        Object.keys(patientData).length === 0
      ) {
        // `name` belongs to User, but the flattened profile has one resource
        // timestamp. Touch Patient so a name-only change advances updatedAt.
        patientData.updatedAt = new Date();
      }

      const hasPatientChanges = Object.keys(patientData).length > 0;
      const patient = hasPatientChanges
        ? await transaction.patient.update({
            where: { id: existingPatient.id },
            data: patientData,
            select: patientProfileSelect,
          })
        : await transaction.patient.findUnique({
            where: { id: existingPatient.id },
            select: patientProfileSelect,
          });

      if (!patient) {
        throw new NotFoundException('Patient profile not found');
      }

      if (
        canonicalTimeZone !== undefined &&
        canonicalTimeZone !== existingPatient.timeZone
      ) {
        const now = Date.now();
        const reconciliationWindow = 36 * 60 * 60 * 1000;

        // Pending logs are derived state. Rebuild the current local-day window
        // in the new canonical zone on the next medication read, while keeping
        // every TAKEN/MISSED/SKIPPED record intact.
        await transaction.medicationLog.deleteMany({
          where: {
            status: MedicationLogStatus.PENDING,
            medication: { patientId: existingPatient.id },
            scheduledFor: {
              gte: new Date(now - reconciliationWindow),
              lt: new Date(now + reconciliationWindow),
            },
          },
        });
      }

      await this.recordAudit(transaction, userId, 'ACCOUNT_PROFILE_UPDATED', {
        entity: 'Patient',
        entityId: patient.id,
        patientId: patient.id,
        operation: 'PROFILE_UPDATE',
      });
      return this.toPatientProfile(patient);
    });
  }

  private async recordAudit(
    database: Pick<Prisma.TransactionClient, 'auditLog'>,
    userId: string,
    action: string,
    details: {
      entity: string;
      entityId: string;
      patientId: string;
      operation: string;
    },
  ): Promise<void> {
    if (!database.auditLog?.create) return;
    await database.auditLog.create({
      data: {
        userId,
        action,
        entity: details.entity,
        entityId: details.entityId,
        metadata: {
          patientId: details.patientId,
          operation: details.operation,
        },
      },
    });
  }

  private toPatientProfile(patient: PatientProfileRecord): PatientProfile {
    return {
      id: patient.id,
      userId: patient.userId,
      name: patient.user.name,
      email: patient.user.email,
      dateOfBirth: patient.dateOfBirth
        ? patient.dateOfBirth.toISOString().slice(0, 10)
        : null,
      phoneNumber: patient.phoneNumber,
      emergencyContact: patient.emergencyContact,
      timeZone: patient.timeZone,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };
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

    throw new Error('Serializable patient transaction retry exhausted');
  }
}
