import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSymptomDto, UpdateSymptomDto } from './dto/symptom.dto';

const symptomInclude = {
  medications: {
    include: {
      medication: {
        select: { id: true, name: true, dosage: true, status: true },
      },
    },
  },
  measurements: {
    include: {
      measurement: {
        select: {
          id: true,
          type: true,
          value: true,
          secondaryValue: true,
          unit: true,
          measuredAt: true,
        },
      },
    },
  },
} satisfies Prisma.SymptomEntryInclude;

type SymptomWithLinks = Prisma.SymptomEntryGetPayload<{
  include: typeof symptomInclude;
}>;

@Injectable()
export class SymptomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
  ) {}

  async listForPatient(userId: string) {
    const patient = await this.access.getPatientForUser(userId);
    const symptoms = await this.findMany(patient.id);
    await this.audit.record({
      userId,
      action: 'SYMPTOM_LIST_ACCESSED',
      entity: 'SymptomEntry',
      metadata: { patientId: patient.id, count: symptoms.length },
    });
    return symptoms.map((symptom) => this.toResponse(symptom));
  }

  async listForDoctor(doctorUserId: string, patientId: string) {
    await this.access.requireAssignedPatient(doctorUserId, patientId);
    const symptoms = await this.findMany(patientId);
    await this.audit.record({
      userId: doctorUserId,
      action: 'DOCTOR_SYMPTOM_LIST_ACCESSED',
      entity: 'SymptomEntry',
      metadata: { patientId, count: symptoms.length },
    });
    return symptoms.map((symptom) => this.toResponse(symptom));
  }

  async findOne(userId: string, symptomId: string) {
    const patient = await this.access.getPatientForUser(userId);
    const symptom = await this.prisma.symptomEntry.findFirst({
      where: { id: symptomId, patientId: patient.id },
      include: symptomInclude,
    });
    if (!symptom) throw new NotFoundException('Symptom entry not found');
    await this.audit.record({
      userId,
      action: 'SYMPTOM_ACCESSED',
      entity: 'SymptomEntry',
      entityId: symptom.id,
      metadata: { patientId: patient.id },
    });
    return this.toResponse(symptom);
  }

  async create(userId: string, dto: CreateSymptomDto) {
    const patient = await this.access.getPatientForUser(userId);
    this.assertOccurredAt(dto.occurredAt);

    return this.prisma.$transaction(async (transaction) => {
      await this.assertOwnedLinks(
        transaction,
        patient.id,
        dto.medicationIds ?? [],
        dto.measurementIds ?? [],
      );
      const symptom = await transaction.symptomEntry.create({
        data: {
          patientId: patient.id,
          name: dto.name,
          severity: dto.severity,
          occurredAt: new Date(dto.occurredAt),
          notes: dto.notes ?? null,
          medications: {
            create: (dto.medicationIds ?? []).map((medicationId) => ({
              medicationId,
            })),
          },
          measurements: {
            create: (dto.measurementIds ?? []).map((measurementId) => ({
              measurementId,
            })),
          },
        },
        include: symptomInclude,
      });
      await this.audit.record(
        {
          userId,
          action: 'SYMPTOM_CREATED',
          entity: 'SymptomEntry',
          entityId: symptom.id,
          metadata: { patientId: patient.id },
        },
        transaction,
      );
      return this.toResponse(symptom);
    });
  }

  async update(userId: string, symptomId: string, dto: UpdateSymptomDto) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one symptom field is required');
    }
    if (dto.occurredAt) this.assertOccurredAt(dto.occurredAt);
    const patient = await this.access.getPatientForUser(userId);

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.symptomEntry.findFirst({
        where: { id: symptomId, patientId: patient.id },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Symptom entry not found');

      await this.assertOwnedLinks(
        transaction,
        patient.id,
        dto.medicationIds ?? [],
        dto.measurementIds ?? [],
      );
      const symptom = await transaction.symptomEntry.update({
        where: { id: existing.id },
        data: {
          name: dto.name,
          severity: dto.severity,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
          notes: dto.notes,
          medications:
            dto.medicationIds === undefined
              ? undefined
              : {
                  deleteMany: {},
                  create: dto.medicationIds.map((medicationId) => ({
                    medicationId,
                  })),
                },
          measurements:
            dto.measurementIds === undefined
              ? undefined
              : {
                  deleteMany: {},
                  create: dto.measurementIds.map((measurementId) => ({
                    measurementId,
                  })),
                },
        },
        include: symptomInclude,
      });
      await this.audit.record(
        {
          userId,
          action: 'SYMPTOM_UPDATED',
          entity: 'SymptomEntry',
          entityId: symptom.id,
          metadata: { patientId: patient.id },
        },
        transaction,
      );
      return this.toResponse(symptom);
    });
  }

  async remove(userId: string, symptomId: string): Promise<void> {
    const patient = await this.access.getPatientForUser(userId);
    await this.prisma.$transaction(async (transaction) => {
      const removed = await transaction.symptomEntry.deleteMany({
        where: { id: symptomId, patientId: patient.id },
      });
      if (removed.count === 0) {
        throw new NotFoundException('Symptom entry not found');
      }
      await this.audit.record(
        {
          userId,
          action: 'SYMPTOM_DELETED',
          entity: 'SymptomEntry',
          entityId: symptomId,
          metadata: { patientId: patient.id },
        },
        transaction,
      );
    });
  }

  private findMany(patientId: string): Promise<SymptomWithLinks[]> {
    return this.prisma.symptomEntry.findMany({
      where: { patientId },
      include: symptomInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  private async assertOwnedLinks(
    database: Prisma.TransactionClient,
    patientId: string,
    medicationIds: string[],
    measurementIds: string[],
  ): Promise<void> {
    const [medications, measurements] = await Promise.all([
      medicationIds.length === 0
        ? Promise.resolve(0)
        : database.medication.count({
            where: { id: { in: medicationIds }, patientId },
          }),
      measurementIds.length === 0
        ? Promise.resolve(0)
        : database.measurement.count({
            where: { id: { in: measurementIds }, patientId },
          }),
    ]);
    if (medications !== medicationIds.length) {
      throw new NotFoundException('Linked medication not found');
    }
    if (measurements !== measurementIds.length) {
      throw new NotFoundException('Linked measurement not found');
    }
  }

  private assertOccurredAt(value: string): void {
    if (new Date(value).getTime() > Date.now() + 60_000) {
      throw new BadRequestException('occurredAt cannot be in the future');
    }
  }

  private toResponse(symptom: SymptomWithLinks) {
    const { medications, measurements, ...entry } = symptom;
    return {
      ...entry,
      medications: medications.map(({ medication }) => medication),
      measurements: measurements.map(({ measurement }) => measurement),
    };
  }
}
