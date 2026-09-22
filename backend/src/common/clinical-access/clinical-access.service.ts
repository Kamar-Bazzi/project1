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

export type ClinicalDataCategory =
  'MEDICATIONS' | 'MEASUREMENTS' | 'WEARABLE_DATA' | 'DOCUMENTS';

export interface ClinicalDataPermissions {
  medicationsAllowed: boolean;
  measurementsAllowed: boolean;
  wearableDataAllowed: boolean;
  documentsAllowed: boolean;
}

export const FULL_CLINICAL_DATA_PERMISSIONS: ClinicalDataPermissions = {
  medicationsAllowed: true,
  measurementsAllowed: true,
  wearableDataAllowed: true,
  documentsAllowed: true,
};

const permissionFieldByCategory: Record<
  ClinicalDataCategory,
  keyof ClinicalDataPermissions
> = {
  MEDICATIONS: 'medicationsAllowed',
  MEASUREMENTS: 'measurementsAllowed',
  WEARABLE_DATA: 'wearableDataAllowed',
  DOCUMENTS: 'documentsAllowed',
};

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
    category?: ClinicalDataCategory,
  ) {
    const doctor = await this.getDoctorForUser(doctorUserId, database);
    const permissionFilter: Prisma.DoctorPatientAccessWhereInput = category
      ? { [permissionFieldByCategory[category]]: true }
      : {};
    const patient = await database.patient.findFirst({
      where: {
        id: patientId,
        doctorAccessGrants: {
          some: { doctorId: doctor.id, active: true, ...permissionFilter },
        },
      },
      select: {
        id: true,
        userId: true,
        timeZone: true,
        user: { select: { id: true, name: true, email: true } },
        doctorAccessGrants: {
          where: { doctorId: doctor.id, active: true },
          select: {
            medicationsAllowed: true,
            measurementsAllowed: true,
            wearableDataAllowed: true,
            documentsAllowed: true,
          },
          take: 1,
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Assigned patient not found');
    }

    const [permissions] = patient.doctorAccessGrants;
    if (!permissions) {
      throw new NotFoundException('Assigned patient not found');
    }
    const patientRecord = {
      id: patient.id,
      userId: patient.userId,
      timeZone: patient.timeZone,
      user: patient.user,
    };

    return { doctor, patient: patientRecord, permissions };
  }

  assertCategoryAllowed(
    permissions: ClinicalDataPermissions,
    category: ClinicalDataCategory,
  ): void {
    if (!permissions[permissionFieldByCategory[category]]) {
      // Keep assignment and consent failures indistinguishable to callers.
      throw new NotFoundException('Assigned patient not found');
    }
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
      return {
        patient,
        doctor: null,
        permissions: FULL_CLINICAL_DATA_PERMISSIONS,
      };
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

    return {
      patient,
      doctor: null,
      permissions: FULL_CLINICAL_DATA_PERMISSIONS,
    };
  }
}
