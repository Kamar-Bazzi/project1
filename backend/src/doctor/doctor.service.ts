import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  EmergencyEventStatus,
  HealthAlertSeverity,
  HealthAlertStatus,
  MedicationLogStatus,
  MedicationStatus,
  Prisma,
} from '@prisma/client';

import { paginationMetadata } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { DoctorAlertQueryDto } from './dto/doctor-alert-query.dto';
import { DoctorPatientQueryDto } from './dto/doctor-patient-query.dto';

@Injectable()
export class DoctorService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(userId: string) {
    const doctor = await this.getDoctor(userId);
    const doctorId = doctor.id;
    const now = new Date();
    const assignedPatient = this.assignedPatientFilter(doctorId);
    const assignedClinicalRecord = { patient: assignedPatient };
    const missedSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const patientNeedsAttention: Prisma.PatientWhereInput = {
      ...assignedPatient,
      OR: [
        {
          healthAlerts: {
            some: {
              status: HealthAlertStatus.ACTIVE,
              severity: {
                in: [HealthAlertSeverity.WARNING, HealthAlertSeverity.URGENT],
              },
            },
          },
        },
        {
          medications: {
            some: {
              logs: {
                some: {
                  status: MedicationLogStatus.MISSED,
                  scheduledFor: { gte: missedSince },
                },
              },
            },
          },
        },
        {
          emergencyEvents: { some: { status: EmergencyEventStatus.ACTIVE } },
        },
      ],
    };

    const [
      assignedPatients,
      activeAlerts,
      activeMedications,
      upcomingAppointments,
      missedMedicationDoses,
      attentionPatientCount,
      patients,
      alerts,
      medications,
      measurements,
      appointments,
      missedMedicationLogs,
      patientsNeedingAttention,
    ] = await Promise.all([
      this.prisma.patient.count({ where: assignedPatient }),
      this.prisma.healthAlert.count({
        where: {
          ...assignedClinicalRecord,
          status: HealthAlertStatus.ACTIVE,
        },
      }),
      this.prisma.medication.count({
        where: {
          ...assignedClinicalRecord,
          status: MedicationStatus.ACTIVE,
        },
      }),
      this.prisma.appointment.count({
        where: {
          doctorId,
          status: AppointmentStatus.SCHEDULED,
          appointmentDate: { gte: now },
          patient: assignedPatient,
        },
      }),
      this.prisma.medicationLog.count({
        where: {
          status: MedicationLogStatus.MISSED,
          scheduledFor: { gte: missedSince },
          medication: assignedClinicalRecord,
        },
      }),
      this.prisma.patient.count({ where: patientNeedsAttention }),
      this.prisma.patient.findMany({
        where: assignedPatient,
        select: {
          id: true,
          dateOfBirth: true,
          phoneNumber: true,
          timeZone: true,
          user: { select: { id: true, name: true, email: true } },
          _count: {
            select: {
              medications: { where: { status: MedicationStatus.ACTIVE } },
              measurements: true,
              healthAlerts: { where: { status: HealthAlertStatus.ACTIVE } },
              appointments: {
                where: {
                  doctorId,
                  status: AppointmentStatus.SCHEDULED,
                  appointmentDate: { gte: now },
                },
              },
            },
          },
        },
        orderBy: { user: { name: 'asc' } },
        take: 10,
      }),
      this.prisma.healthAlert.findMany({
        where: {
          ...assignedClinicalRecord,
          status: HealthAlertStatus.ACTIVE,
        },
        include: {
          patient: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
        take: 10,
      }),
      this.prisma.medication.findMany({
        where: {
          ...assignedClinicalRecord,
          status: MedicationStatus.ACTIVE,
        },
        include: {
          patient: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
          schedules: { orderBy: { scheduledTime: 'asc' } },
          logs: {
            orderBy: { scheduledFor: 'desc' },
            take: 5,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.measurement.findMany({
        where: assignedClinicalRecord,
        include: {
          patient: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
      this.prisma.appointment.findMany({
        where: {
          doctorId,
          status: AppointmentStatus.SCHEDULED,
          appointmentDate: { gte: now },
          patient: assignedPatient,
        },
        include: {
          patient: {
            select: {
              id: true,
              dateOfBirth: true,
              phoneNumber: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { appointmentDate: 'asc' },
        take: 10,
      }),
      this.prisma.medicationLog.findMany({
        where: {
          status: MedicationLogStatus.MISSED,
          scheduledFor: { gte: missedSince },
          medication: assignedClinicalRecord,
        },
        include: {
          medication: {
            include: {
              patient: {
                select: {
                  id: true,
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
        orderBy: { scheduledFor: 'desc' },
        take: 10,
      }),
      this.prisma.patient.findMany({
        where: patientNeedsAttention,
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } },
          healthAlerts: {
            where: { status: HealthAlertStatus.ACTIVE },
            select: {
              id: true,
              severity: true,
              message: true,
              detectedAt: true,
            },
            orderBy: { detectedAt: 'desc' },
            take: 3,
          },
          emergencyEvents: {
            where: { status: EmergencyEventStatus.ACTIVE },
            select: { id: true, triggeredAt: true },
            take: 1,
          },
          medications: {
            where: {
              logs: {
                some: {
                  status: MedicationLogStatus.MISSED,
                  scheduledFor: { gte: missedSince },
                },
              },
            },
            select: {
              id: true,
              name: true,
              logs: {
                where: {
                  status: MedicationLogStatus.MISSED,
                  scheduledFor: { gte: missedSince },
                },
                select: { id: true },
              },
            },
            take: 10,
          },
        },
        orderBy: { user: { name: 'asc' } },
        take: 10,
      }),
    ]);

    return {
      doctor,
      summary: {
        assignedPatients,
        activeAlerts,
        activeMedications,
        upcomingAppointments,
        missedMedicationDoses,
        patientsNeedingAttention: attentionPatientCount,
      },
      patients,
      alerts,
      medications,
      measurements,
      recentMeasurements: measurements,
      appointments,
      missedMedicationLogs,
      wearableAlerts: alerts,
      patientsNeedingAttention,
    };
  }

  async findPatients(userId: string, query: DoctorPatientQueryDto) {
    const doctor = await this.getDoctor(userId);
    const where: Prisma.PatientWhereInput = {
      ...this.assignedPatientFilter(doctor.id),
      user: query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    };
    const now = new Date();
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        select: {
          id: true,
          dateOfBirth: true,
          phoneNumber: true,
          timeZone: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
          measurements: {
            orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
          },
          healthAlerts: {
            where: { status: HealthAlertStatus.ACTIVE },
            orderBy: { detectedAt: 'desc' },
            take: 1,
          },
          appointments: {
            where: {
              doctorId: doctor.id,
              status: AppointmentStatus.SCHEDULED,
              appointmentDate: { gte: now },
            },
            orderBy: { appointmentDate: 'asc' },
            take: 1,
          },
          _count: {
            select: {
              medications: { where: { status: MedicationStatus.ACTIVE } },
              measurements: true,
              healthAlerts: { where: { status: HealthAlertStatus.ACTIVE } },
              appointments: {
                where: {
                  doctorId: doctor.id,
                  status: AppointmentStatus.SCHEDULED,
                  appointmentDate: { gte: now },
                },
              },
            },
          },
        },
        orderBy: { user: { name: 'asc' } },
        skip,
        take: query.pageSize,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      items,
      pagination: paginationMetadata(query.page, query.pageSize, total),
    };
  }

  async findPatient(userId: string, patientId: string) {
    const doctor = await this.getDoctor(userId);
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        doctorAccessGrants: {
          some: { doctorId: doctor.id, active: true },
        },
      },
      select: {
        id: true,
        dateOfBirth: true,
        phoneNumber: true,
        emergencyContact: true,
        timeZone: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true } },
        medications: {
          include: {
            schedules: { orderBy: { scheduledTime: 'asc' } },
            logs: { orderBy: { scheduledFor: 'desc' }, take: 30 },
          },
          orderBy: { updatedAt: 'desc' },
          take: 100,
        },
        measurements: {
          orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
          take: 100,
        },
        healthAlerts: {
          orderBy: [{ detectedAt: 'desc' }, { createdAt: 'desc' }],
          take: 100,
        },
        healthMetrics: {
          orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
          take: 100,
        },
        appointments: {
          where: { doctorId: doctor.id },
          orderBy: { appointmentDate: 'desc' },
          take: 100,
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Assigned patient not found');
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DOCTOR_PATIENT_RECORD_ACCESSED',
        entity: 'Patient',
        entityId: patient.id,
        metadata: { patientId: patient.id },
      },
    });

    return patient;
  }

  async findAlerts(userId: string, query: DoctorAlertQueryDto) {
    const doctor = await this.getDoctor(userId);
    const where: Prisma.HealthAlertWhereInput = {
      patientId: query.patientId,
      status: query.status,
      severity: query.severity,
      metricType: query.metricType,
      patient: this.assignedPatientFilter(doctor.id),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.healthAlert.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: [{ detectedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.healthAlert.count({ where }),
    ]);

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'DOCTOR_HEALTH_ALERT_LIST_ACCESSED',
        entity: 'HealthAlert',
        metadata: {
          count: items.length,
          resultCount: total,
        },
      },
    });

    return {
      items,
      pagination: paginationMetadata(query.page, query.pageSize, total),
    };
  }

  private async getDoctor(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        specialization: true,
        licenseNumber: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    return doctor;
  }

  private assignedPatientFilter(doctorId: string): Prisma.PatientWhereInput {
    return {
      doctorAccessGrants: {
        some: { doctorId, active: true },
      },
    };
  }
}
