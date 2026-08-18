import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmergencyEvent, EmergencyEventStatus, Prisma } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmergencyEventDto } from './dto/emergency-event.dto';

const EMERGENCY_GUIDANCE = {
  headline: 'Your urgent help request has been recorded.',
  instructions: [
    'If you believe this may be life-threatening, call local emergency services now.',
    'Contact a trusted emergency contact who can reach you directly.',
    'Keep this page open while help is being arranged when it is safe to do so.',
  ],
  disclaimer:
    'CareTrack does not diagnose medical conditions and does not replace emergency services or professional medical advice.',
};

@Injectable()
export class EmergencyEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async findForPatient(userId: string) {
    const patient = await this.access.getPatientForUser(userId);
    const [activeEvent, items, contacts, recentReadings] = await Promise.all([
      this.prisma.emergencyEvent.findFirst({
        where: { patientId: patient.id, status: EmergencyEventStatus.ACTIVE },
        orderBy: { triggeredAt: 'desc' },
      }),
      this.prisma.emergencyEvent.findMany({
        where: { patientId: patient.id },
        orderBy: { triggeredAt: 'desc' },
        take: 50,
      }),
      this.prisma.emergencyContact.findMany({
        where: { patientId: patient.id, active: true },
        select: {
          id: true,
          name: true,
          relationship: true,
          phone: true,
          email: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.recentReadings(patient.id),
    ]);
    await this.audit.record({
      userId,
      action: 'EMERGENCY_EVENT_LIST_ACCESSED',
      entity: 'EmergencyEvent',
      metadata: {
        patientId: patient.id,
        count: items.length,
        contactCount: contacts.length,
      },
    });
    return {
      activeEvent,
      items,
      contacts,
      recentReadings,
      guidance: EMERGENCY_GUIDANCE,
    };
  }

  async activate(userId: string, dto: CreateEmergencyEventDto) {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException(
        'latitude and longitude must be provided together',
      );
    }
    const patient = await this.access.getPatientForUser(userId);
    let event: EmergencyEvent;
    try {
      event = await this.prisma.$transaction(async (transaction) => {
        const active = await transaction.emergencyEvent.findFirst({
          where: {
            patientId: patient.id,
            status: EmergencyEventStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (active) {
          throw new ConflictException('Emergency mode is already active');
        }
        const created = await transaction.emergencyEvent.create({
          data: {
            patientId: patient.id,
            note: dto.note ?? null,
            latitude: dto.latitude,
            longitude: dto.longitude,
          },
        });
        await this.audit.record(
          {
            userId,
            action: 'EMERGENCY_MODE_ACTIVATED',
            entity: 'EmergencyEvent',
            entityId: created.id,
            metadata: {
              patientId: patient.id,
              emergencyEventId: created.id,
              status: created.status,
            },
          },
          transaction,
        );
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Emergency mode is already active');
      }
      throw error;
    }

    let notificationQueued = true;
    try {
      await this.notifications.enqueueEmergencyMode(event.id, patient.id);
    } catch {
      notificationQueued = false;
      await this.audit.record({
        userId,
        action: 'EMERGENCY_NOTIFICATION_ENQUEUE_FAILED',
        entity: 'EmergencyEvent',
        entityId: event.id,
        metadata: {
          patientId: patient.id,
          emergencyEventId: event.id,
          status: event.status,
        },
      });
    }

    const [contacts, recentReadings] = await Promise.all([
      this.prisma.emergencyContact.findMany({
        where: { patientId: patient.id, active: true },
        select: {
          id: true,
          name: true,
          relationship: true,
          phone: true,
          email: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.recentReadings(patient.id),
    ]);
    return {
      event,
      contacts,
      recentReadings,
      notificationQueued,
      guidance: EMERGENCY_GUIDANCE,
    };
  }

  async resolve(userId: string, eventId: string) {
    const patient = await this.access.getPatientForUser(userId);
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.emergencyEvent.findFirst({
        where: {
          id: eventId,
          patientId: patient.id,
          status: EmergencyEventStatus.ACTIVE,
        },
      });
      if (!existing) {
        throw new NotFoundException('Active emergency event not found');
      }
      const event = await transaction.emergencyEvent.update({
        where: { id: existing.id },
        data: {
          status: EmergencyEventStatus.RESOLVED,
          resolvedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          userId,
          action: 'EMERGENCY_MODE_RESOLVED',
          entity: 'EmergencyEvent',
          entityId: event.id,
          metadata: {
            patientId: patient.id,
            emergencyEventId: event.id,
            status: event.status,
          },
        },
        transaction,
      );
      return { event, guidance: EMERGENCY_GUIDANCE };
    });
  }

  private async recentReadings(patientId: string) {
    const [measurements, wearableMetrics] = await Promise.all([
      this.prisma.measurement.findMany({
        where: { patientId },
        select: {
          id: true,
          type: true,
          value: true,
          secondaryValue: true,
          unit: true,
          measuredAt: true,
        },
        orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
      this.prisma.healthMetric.findMany({
        where: { patientId },
        select: {
          id: true,
          metricType: true,
          value: true,
          secondaryValue: true,
          unit: true,
          source: true,
          measuredAt: true,
        },
        orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
    ]);
    return { measurements, wearableMetrics };
  }
}
