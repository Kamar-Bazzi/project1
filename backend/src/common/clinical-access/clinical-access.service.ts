import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export interface ClinicalActor {
  id: string;
  role: UserRole;
}

type ClinicalAccessDatabase = Pick<
  Prisma.TransactionClient,
  'patient' | 'doctor'
>;

@Injectable()
export class ClinicalAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getPatientForUser(
    userId: string,
    database: ClinicalAccessDatabase = this.prisma,
  ) {
    const patient = await database.patient.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        timeZone: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    return patient;
  }

  async getDoctorForUser(
    userId: string,
    database: ClinicalAccessDatabase = this.prisma,
  ) {
    const doctor = await database.doctor.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        specialization: true,
        licenseNumber: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    return doctor;
  }

  async requireAssignedPatient(
    doctorUserId: string,
    patientId: string,
    database: ClinicalAccessDatabase = this.prisma,
  ) {
    const doctor = await this.getDoctorForUser(doctorUserId, database);
    const patient = await database.patient.findFirst({
      where: {
        id: patientId,
        doctorAccessGrants: {
          some: { doctorId: doctor.id, active: true },
        },
      },
      select: {
        id: true,
        userId: true,
        timeZone: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!patient) {
      throw new NotFoundException('Assigned patient not found');
    }

    return { doctor, patient };
  }

  async resolvePatientForActor(
    actor: ClinicalActor,
    requestedPatientId?: string,
    database: ClinicalAccessDatabase = this.prisma,
  ) {
    if (actor.role === UserRole.PATIENT) {
      if (requestedPatientId !== undefined) {
        throw new BadRequestException(
          'Patients cannot request another patient record',
        );
      }

      const patient = await this.getPatientForUser(actor.id, database);
      return { patient, doctor: null };
    }

    if (!requestedPatientId) {
      throw new BadRequestException('patientId is required');
    }

    if (actor.role === UserRole.DOCTOR) {
      return this.requireAssignedPatient(
        actor.id,
        requestedPatientId,
        database,
      );
    }

    const patient = await database.patient.findUnique({
      where: { id: requestedPatientId },
      select: {
        id: true,
        userId: true,
        timeZone: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return { patient, doctor: null };
  }
}
