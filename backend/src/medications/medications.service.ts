import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicationLogStatus, MedicationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_TIME_ZONE,
  isIanaTimeZone,
} from '../common/validators/is-iana-time-zone.validator';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationLogStatusDto } from './dto/update-medication-log-status.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RECENT_LOG_LIMIT = 30;
const LOG_BACKFILL_DAYS = 30;
const LOG_CREATE_BATCH_SIZE = 1000;
const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

interface SchedulableMedication {
  id: string;
  status: MedicationStatus;
  startDate: Date;
  endDate: Date | null;
  schedules: Array<{
    id: string;
    scheduledTime: string;
    createdAt: Date;
  }>;
}

interface DerivedMedicationLog {
  medicationId: string;
  scheduleId: string;
  scheduleDate: Date;
  scheduledFor: Date;
  status: MedicationLogStatus;
}

interface LocalDay {
  dateKey: string;
  start: Date;
  end: Date;
}

interface SchedulingPatient {
  id: string;
  timeZone: string;
  isCanonicalTimeZone: boolean;
}

interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

@Injectable()
export class MedicationsService {
  private readonly dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, requestedTimeZone?: string) {
    const validRequestedTimeZone =
      this.resolveRequestedTimeZone(requestedTimeZone);

    return this.runSerializableTransaction(async (transaction) => {
      const patient = await this.getSchedulingPatient(
        transaction,
        userId,
        validRequestedTimeZone,
      );
      const patientId = patient.id;
      const today = this.getZonedDay(patient.timeZone);
      const medications = await transaction.medication.findMany({
        where: { patientId },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          schedules: {
            select: {
              id: true,
              scheduledTime: true,
              createdAt: true,
            },
          },
        },
      });

      await this.ensureTodaysLogs(
        transaction,
        patientId,
        medications,
        patient.timeZone,
        today,
        patient.isCanonicalTimeZone,
      );

      const responses = await transaction.medication.findMany({
        where: { patientId },
        include: this.responseRelations(patientId),
        orderBy: { createdAt: 'desc' },
      });

      return responses.map((response) =>
        this.withTimeZone(response, patient.timeZone),
      );
    });
  }

  async findOne(
    userId: string,
    medicationId: string,
    requestedTimeZone?: string,
  ) {
    const validRequestedTimeZone =
      this.resolveRequestedTimeZone(requestedTimeZone);

    return this.runSerializableTransaction(async (transaction) => {
      const patient = await this.getSchedulingPatient(
        transaction,
        userId,
        validRequestedTimeZone,
      );
      const patientId = patient.id;
      const today = this.getZonedDay(patient.timeZone);
      const medication = await transaction.medication.findFirst({
        where: {
          id: medicationId,
          patientId,
        },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          schedules: {
            select: {
              id: true,
              scheduledTime: true,
              createdAt: true,
            },
          },
        },
      });

      if (!medication) {
        throw new NotFoundException('Medication not found');
      }

      await this.ensureTodaysLogs(
        transaction,
        patientId,
        [medication],
        patient.timeZone,
        today,
        patient.isCanonicalTimeZone,
      );

      const response = await transaction.medication.findFirst({
        where: {
          id: medicationId,
          patientId,
        },
        include: this.responseRelations(patientId),
      });

      if (!response) {
        throw new NotFoundException('Medication not found');
      }

      return this.withTimeZone(response, patient.timeZone);
    });
  }

  async create(
    userId: string,
    createMedicationDto: CreateMedicationDto,
    requestedTimeZone?: string,
  ) {
    const validRequestedTimeZone =
      this.resolveRequestedTimeZone(requestedTimeZone);
    const startDate = this.parseDateOnly(
      createMedicationDto.startDate,
      'startDate',
    );
    const endDate =
      createMedicationDto.endDate === undefined ||
      createMedicationDto.endDate === null
        ? null
        : this.parseDateOnly(createMedicationDto.endDate, 'endDate');

    this.assertDateRange(startDate, endDate);

    return this.runSerializableTransaction(async (transaction) => {
      const patient = await this.getSchedulingPatient(
        transaction,
        userId,
        validRequestedTimeZone,
      );
      const patientId = patient.id;
      const today = this.getZonedDay(patient.timeZone);
      const medication = await transaction.medication.create({
        data: {
          patientId,
          name: createMedicationDto.name,
          dosage: createMedicationDto.dosage,
          instructions: createMedicationDto.instructions ?? null,
          startDate,
          endDate,
          schedules: {
            create: createMedicationDto.schedules.map((schedule) => ({
              scheduledTime: schedule.scheduledTime,
              frequency: schedule.frequency,
            })),
          },
        },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          schedules: {
            select: {
              id: true,
              scheduledTime: true,
              createdAt: true,
            },
          },
        },
      });

      await this.ensureTodaysLogs(
        transaction,
        patientId,
        [medication],
        patient.timeZone,
        today,
        patient.isCanonicalTimeZone,
      );

      const response = await transaction.medication.findFirst({
        where: {
          id: medication.id,
          patientId,
        },
        include: this.responseRelations(patientId),
      });

      if (!response) {
        throw new NotFoundException('Medication not found');
      }

      return this.withTimeZone(response, patient.timeZone);
    });
  }

  async update(
    userId: string,
    medicationId: string,
    updateMedicationDto: UpdateMedicationDto,
    requestedTimeZone?: string,
  ) {
    const validRequestedTimeZone =
      this.resolveRequestedTimeZone(requestedTimeZone);

    return this.runSerializableTransaction(async (transaction) => {
      const patient = await this.getSchedulingPatient(
        transaction,
        userId,
        validRequestedTimeZone,
      );
      const patientId = patient.id;
      const today = this.getZonedDay(patient.timeZone);
      const existingMedication = await transaction.medication.findFirst({
        where: {
          id: medicationId,
          patientId,
        },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          schedules: {
            select: {
              id: true,
              scheduledTime: true,
              createdAt: true,
              frequency: true,
            },
          },
        },
      });

      if (!existingMedication) {
        throw new NotFoundException('Medication not found');
      }

      if (
        updateMedicationDto.status === MedicationStatus.ACTIVE &&
        existingMedication.status !== MedicationStatus.ACTIVE
      ) {
        throw new BadRequestException(
          'Completed or cancelled medications cannot be reactivated',
        );
      }

      const startDate =
        updateMedicationDto.startDate === undefined
          ? existingMedication.startDate
          : this.parseDateOnly(updateMedicationDto.startDate, 'startDate');
      const endDate =
        updateMedicationDto.endDate === undefined
          ? existingMedication.endDate
          : updateMedicationDto.endDate === null
            ? null
            : this.parseDateOnly(updateMedicationDto.endDate, 'endDate');

      this.assertDateRange(startDate, endDate);

      const medicationData: Prisma.MedicationUpdateInput = {};

      if (updateMedicationDto.name !== undefined) {
        medicationData.name = updateMedicationDto.name;
      }

      if (updateMedicationDto.dosage !== undefined) {
        medicationData.dosage = updateMedicationDto.dosage;
      }

      if (updateMedicationDto.instructions !== undefined) {
        medicationData.instructions = updateMedicationDto.instructions;
      }

      if (updateMedicationDto.startDate !== undefined) {
        medicationData.startDate = startDate;
      }

      if (updateMedicationDto.endDate !== undefined) {
        medicationData.endDate = endDate;
      }

      if (updateMedicationDto.status !== undefined) {
        medicationData.status = updateMedicationDto.status;
      }

      await transaction.medication.update({
        where: {
          id: medicationId,
          patientId,
        },
        data: medicationData,
      });

      if (updateMedicationDto.schedules !== undefined) {
        const requestedTimes = new Set(
          updateMedicationDto.schedules.map(
            (schedule) => schedule.scheduledTime,
          ),
        );
        const removedScheduleIds = existingMedication.schedules
          .filter((schedule) => !requestedTimes.has(schedule.scheduledTime))
          .map((schedule) => schedule.id);

        if (removedScheduleIds.length > 0) {
          await transaction.medicationLog.deleteMany({
            where: {
              scheduleId: { in: removedScheduleIds },
              scheduleDate: this.parseDateOnly(today.dateKey, 'scheduleDate'),
              status: MedicationLogStatus.PENDING,
              medication: { patientId },
            },
          });
          await transaction.medicationSchedule.deleteMany({
            where: {
              id: { in: removedScheduleIds },
              medicationId,
              medication: { patientId },
            },
          });
        }

        for (const schedule of updateMedicationDto.schedules) {
          await transaction.medicationSchedule.upsert({
            where: {
              medicationId_scheduledTime: {
                medicationId,
                scheduledTime: schedule.scheduledTime,
              },
            },
            update: { frequency: schedule.frequency },
            create: {
              medicationId,
              scheduledTime: schedule.scheduledTime,
              frequency: schedule.frequency,
            },
          });
        }
      }

      const shouldRebuildTodaysPendingLogs =
        updateMedicationDto.startDate !== undefined ||
        updateMedicationDto.endDate !== undefined ||
        (updateMedicationDto.status !== undefined &&
          updateMedicationDto.status !== existingMedication.status);

      if (shouldRebuildTodaysPendingLogs) {
        await transaction.medicationLog.deleteMany({
          where: {
            medicationId,
            medication: { patientId },
            status: MedicationLogStatus.PENDING,
            scheduledFor: {
              gte: today.start,
              lt: today.end,
            },
          },
        });
      }

      const updatedMedication = await transaction.medication.findFirst({
        where: {
          id: medicationId,
          patientId,
        },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          schedules: {
            select: {
              id: true,
              scheduledTime: true,
              createdAt: true,
            },
          },
        },
      });

      if (!updatedMedication) {
        throw new NotFoundException('Medication not found');
      }

      await this.ensureTodaysLogs(
        transaction,
        patientId,
        [updatedMedication],
        patient.timeZone,
        today,
        patient.isCanonicalTimeZone,
      );

      const response = await transaction.medication.findFirst({
        where: {
          id: medicationId,
          patientId,
        },
        include: this.responseRelations(patientId),
      });

      if (!response) {
        throw new NotFoundException('Medication not found');
      }

      return this.withTimeZone(response, patient.timeZone);
    });
  }

  async remove(userId: string, medicationId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const patientId = await this.getPatientId(transaction, userId);
      const result = await transaction.medication.deleteMany({
        where: {
          id: medicationId,
          patientId,
        },
      });

      if (result.count === 0) {
        throw new NotFoundException('Medication not found');
      }
    });
  }

  async updateLogStatus(
    userId: string,
    medicationId: string,
    logId: string,
    updateStatusDto: UpdateMedicationLogStatusDto,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const patientId = await this.getPatientId(transaction, userId);
      const medicationLog = await transaction.medicationLog.findFirst({
        where: {
          id: logId,
          medicationId,
          medication: { patientId },
        },
      });

      if (!medicationLog) {
        throw new NotFoundException('Medication log not found');
      }

      return transaction.medicationLog.update({
        where: {
          id: logId,
          medicationId,
          medication: { patientId },
        },
        data: {
          status: updateStatusDto.status,
          takenAt:
            updateStatusDto.status === MedicationLogStatus.TAKEN
              ? (medicationLog.takenAt ?? new Date())
              : null,
        },
      });
    });
  }

  private async getPatientId(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<string> {
    const patient = await transaction.patient.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    return patient.id;
  }

  private async getSchedulingPatient(
    transaction: Prisma.TransactionClient,
    userId: string,
    requestedTimeZone?: string,
  ): Promise<SchedulingPatient> {
    const patient = await transaction.patient.findUnique({
      where: { userId },
      select: {
        id: true,
        timeZone: true,
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    if (patient.timeZone) {
      return {
        id: patient.id,
        timeZone: this.canonicalTimeZone(patient.timeZone),
        isCanonicalTimeZone: true,
      };
    }

    if (requestedTimeZone === undefined) {
      await this.removeLegacyPendingLogs(transaction, patient.id);

      return {
        id: patient.id,
        timeZone: DEFAULT_TIME_ZONE,
        isCanonicalTimeZone: false,
      };
    }

    const initialized = await transaction.patient.updateMany({
      where: {
        id: patient.id,
        userId,
        timeZone: null,
      },
      data: { timeZone: requestedTimeZone },
    });

    if (initialized.count === 1) {
      await transaction.medicationLog.deleteMany({
        where: {
          status: MedicationLogStatus.PENDING,
          medication: { patientId: patient.id },
        },
      });

      return {
        id: patient.id,
        timeZone: requestedTimeZone,
        isCanonicalTimeZone: true,
      };
    }

    const concurrentlyInitializedPatient = await transaction.patient.findUnique(
      {
        where: { userId },
        select: {
          id: true,
          timeZone: true,
        },
      },
    );

    if (!concurrentlyInitializedPatient?.timeZone) {
      throw new NotFoundException('Patient profile not found');
    }

    return {
      id: concurrentlyInitializedPatient.id,
      timeZone: this.canonicalTimeZone(concurrentlyInitializedPatient.timeZone),
      isCanonicalTimeZone: true,
    };
  }

  private async removeLegacyPendingLogs(
    transaction: Prisma.TransactionClient,
    patientId: string,
  ): Promise<void> {
    await transaction.medicationLog.deleteMany({
      where: {
        status: MedicationLogStatus.PENDING,
        scheduleDate: null,
        medication: { patientId },
      },
    });
  }

  private async ensureTodaysLogs(
    transaction: Prisma.TransactionClient,
    patientId: string,
    medications: SchedulableMedication[],
    timeZone: string,
    today: LocalDay,
    isCanonicalTimeZone: boolean,
  ): Promise<void> {
    let logsToCreate: DerivedMedicationLog[] = [];

    for (const medication of medications) {
      if (medication.status !== MedicationStatus.ACTIVE) {
        continue;
      }

      for (const schedule of medication.schedules) {
        for (const dateKey of this.backfillDateKeys(
          medication,
          schedule.createdAt,
          today.dateKey,
          timeZone,
          isCanonicalTimeZone,
        )) {
          logsToCreate.push({
            medicationId: medication.id,
            scheduleId: schedule.id,
            scheduleDate: this.parseDateOnly(dateKey, 'scheduleDate'),
            scheduledFor: this.zonedDateTimeToUtc(
              dateKey,
              schedule.scheduledTime,
              timeZone,
            ),
            status:
              dateKey === today.dateKey
                ? MedicationLogStatus.PENDING
                : MedicationLogStatus.MISSED,
          });
        }
      }
    }

    if (logsToCreate.length > 0) {
      logsToCreate = await this.relinkUnambiguousLegacyLogs(
        transaction,
        patientId,
        medications,
        logsToCreate,
      );
    }

    const medicationIds = medications.map((medication) => medication.id);

    if (isCanonicalTimeZone && medicationIds.length > 0) {
      await transaction.medicationLog.updateMany({
        where: {
          medicationId: { in: medicationIds },
          medication: { patientId },
          status: MedicationLogStatus.PENDING,
          scheduledFor: { lt: today.start },
        },
        data: {
          status: MedicationLogStatus.MISSED,
          takenAt: null,
        },
      });
    }

    for (
      let batchStart = 0;
      batchStart < logsToCreate.length;
      batchStart += LOG_CREATE_BATCH_SIZE
    ) {
      await transaction.medicationLog.createMany({
        data: logsToCreate.slice(
          batchStart,
          batchStart + LOG_CREATE_BATCH_SIZE,
        ),
        skipDuplicates: true,
      });
    }
  }

  private backfillDateKeys(
    medication: SchedulableMedication,
    scheduleCreatedAt: Date,
    todayDateKey: string,
    timeZone: string,
    includeHistory: boolean,
  ): string[] {
    const startDateKey = this.storedDateKey(medication.startDate);
    const endDateKey = medication.endDate
      ? this.storedDateKey(medication.endDate)
      : null;
    const scheduleCreatedDateKey = this.dateKeyFromParts(
      this.zonedDateTimeParts(scheduleCreatedAt, timeZone),
    );
    const backfillWindowStart = includeHistory
      ? this.addCalendarDays(todayDateKey, -(LOG_BACKFILL_DAYS - 1))
      : todayDateKey;
    const firstDateKey = [
      startDateKey,
      scheduleCreatedDateKey,
      backfillWindowStart,
    ].sort()[2];
    const lastDateKey =
      endDateKey && endDateKey < todayDateKey ? endDateKey : todayDateKey;

    if (firstDateKey > lastDateKey) {
      return [];
    }

    const dateKeys: string[] = [];

    for (
      let dateKey = firstDateKey;
      dateKey <= lastDateKey;
      dateKey = this.addCalendarDays(dateKey, 1)
    ) {
      dateKeys.push(dateKey);
    }

    return dateKeys;
  }

  private async relinkUnambiguousLegacyLogs(
    transaction: Prisma.TransactionClient,
    patientId: string,
    medications: SchedulableMedication[],
    derivedLogs: DerivedMedicationLog[],
  ): Promise<DerivedMedicationLog[]> {
    const derivedRange = derivedLogs.reduce(
      (range, log) => ({
        earliestScheduledFor: Math.min(
          range.earliestScheduledFor,
          log.scheduledFor.getTime(),
        ),
        latestScheduledFor: Math.max(
          range.latestScheduledFor,
          log.scheduledFor.getTime(),
        ),
        earliestScheduleDate: Math.min(
          range.earliestScheduleDate,
          log.scheduleDate.getTime(),
        ),
        latestScheduleDate: Math.max(
          range.latestScheduleDate,
          log.scheduleDate.getTime(),
        ),
      }),
      {
        earliestScheduledFor: Number.POSITIVE_INFINITY,
        latestScheduledFor: Number.NEGATIVE_INFINITY,
        earliestScheduleDate: Number.POSITIVE_INFINITY,
        latestScheduleDate: Number.NEGATIVE_INFINITY,
      },
    );
    const scheduleIds = [
      ...new Set(derivedLogs.map(({ scheduleId }) => scheduleId)),
    ];
    const relevantLogs = await transaction.medicationLog.findMany({
      where: {
        medicationId: {
          in: medications.map((medication) => medication.id),
        },
        medication: { patientId },
        OR: [
          {
            scheduleId: null,
            scheduleDate: null,
            scheduledFor: {
              gte: new Date(derivedRange.earliestScheduledFor),
              lte: new Date(derivedRange.latestScheduledFor),
            },
          },
          {
            scheduleId: { in: scheduleIds },
            scheduleDate: {
              gte: new Date(derivedRange.earliestScheduleDate),
              lte: new Date(derivedRange.latestScheduleDate),
            },
          },
        ],
      },
      select: {
        id: true,
        medicationId: true,
        scheduleId: true,
        scheduleDate: true,
        scheduledFor: true,
      },
    });
    const legacyLogs = relevantLogs.filter(
      (log) => log.scheduleId === null && log.scheduleDate === null,
    );
    const occupiedScheduleDates = new Set(
      relevantLogs.flatMap((log) =>
        log.scheduleId !== null && log.scheduleDate !== null
          ? [this.scheduleDateIdentityKey(log.scheduleId, log.scheduleDate)]
          : [],
      ),
    );

    const derivedByInstant = new Map<string, DerivedMedicationLog[]>();
    const legacyByInstant = new Map<string, typeof legacyLogs>();

    for (const derivedLog of derivedLogs) {
      const key = this.medicationInstantKey(
        derivedLog.medicationId,
        derivedLog.scheduledFor,
      );
      const matchingLogs = derivedByInstant.get(key) ?? [];
      matchingLogs.push(derivedLog);
      derivedByInstant.set(key, matchingLogs);
    }

    for (const legacyLog of legacyLogs) {
      const key = this.medicationInstantKey(
        legacyLog.medicationId,
        legacyLog.scheduledFor,
      );
      const matchingLogs = legacyByInstant.get(key) ?? [];
      matchingLogs.push(legacyLog);
      legacyByInstant.set(key, matchingLogs);
    }

    for (const [key, matchingLegacyLogs] of legacyByInstant) {
      const matchingDerivedLogs = derivedByInstant.get(key) ?? [];

      if (matchingLegacyLogs.length !== 1 || matchingDerivedLogs.length !== 1) {
        continue;
      }

      const [legacyLog] = matchingLegacyLogs;
      const [derivedLog] = matchingDerivedLogs;

      if (
        occupiedScheduleDates.has(
          this.scheduleDateIdentityKey(
            derivedLog.scheduleId,
            derivedLog.scheduleDate,
          ),
        )
      ) {
        continue;
      }

      await transaction.medicationLog.update({
        where: {
          id: legacyLog.id,
          medicationId: legacyLog.medicationId,
          medication: { patientId },
        },
        data: {
          scheduleId: derivedLog.scheduleId,
          scheduleDate: derivedLog.scheduleDate,
        },
      });
    }

    return derivedLogs;
  }

  private medicationInstantKey(medicationId: string, scheduledFor: Date) {
    return `${medicationId}:${scheduledFor.getTime()}`;
  }

  private scheduleDateIdentityKey(scheduleId: string, scheduleDate: Date) {
    return `${scheduleId}:${this.storedDateKey(scheduleDate)}`;
  }

  private responseRelations(patientId: string) {
    return {
      schedules: {
        orderBy: { scheduledTime: 'asc' as const },
      },
      logs: {
        where: {
          medication: { patientId },
        },
        orderBy: { scheduledFor: 'desc' as const },
        take: RECENT_LOG_LIMIT,
      },
    };
  }

  private parseDateOnly(value: string, fieldName: string): Date {
    if (!DATE_ONLY_PATTERN.test(value)) {
      throw new BadRequestException(
        `${fieldName} must be a valid date in YYYY-MM-DD format`,
      );
    }

    const parsedDate = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      this.storedDateKey(parsedDate) !== value
    ) {
      throw new BadRequestException(
        `${fieldName} must be a valid date in YYYY-MM-DD format`,
      );
    }

    return parsedDate;
  }

  private assertDateRange(startDate: Date, endDate: Date | null): void {
    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
  }

  private storedDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private resolveRequestedTimeZone(
    requestedTimeZone?: string,
  ): string | undefined {
    return requestedTimeZone === undefined
      ? undefined
      : this.canonicalTimeZone(requestedTimeZone);
  }

  private canonicalTimeZone(timeZone: string): string {
    if (!isIanaTimeZone(timeZone)) {
      throw new BadRequestException(
        'X-Time-Zone must be a valid IANA time zone',
      );
    }

    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions()
      .timeZone;
  }

  private getZonedDay(timeZone: string, now = new Date()): LocalDay {
    const nowParts = this.zonedDateTimeParts(now, timeZone);
    const dateKey = this.dateKeyFromParts(nowParts);
    const nextDateKey = this.addCalendarDays(dateKey, 1);

    return {
      dateKey,
      start: this.zonedDateTimeToUtc(dateKey, '00:00', timeZone),
      end: this.zonedDateTimeToUtc(nextDateKey, '00:00', timeZone),
    };
  }

  private zonedDateTimeToUtc(
    dateKey: string,
    scheduledTime: string,
    timeZone: string,
  ): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    const [hour, minute] = scheduledTime.split(':').map(Number);
    const intendedLocalEpoch = Date.UTC(year, month - 1, day, hour, minute);
    const possibleOffsets = new Set<number>();

    for (const hoursFromGuess of [-36, -24, -12, 0, 12, 24, 36]) {
      const sample = new Date(
        intendedLocalEpoch + hoursFromGuess * 60 * 60 * 1000,
      );
      possibleOffsets.add(this.timeZoneOffsetAt(sample, timeZone));
    }

    const candidates = [...possibleOffsets].map((offset) => {
      const instant = new Date(intendedLocalEpoch - offset);
      const representedLocalEpoch = this.localEpochFromParts(
        this.zonedDateTimeParts(instant, timeZone),
      );

      return {
        instant,
        localDifference: representedLocalEpoch - intendedLocalEpoch,
      };
    });
    const exactCandidates = candidates
      .filter(({ localDifference }) => localDifference === 0)
      .sort(
        (first, second) => first.instant.getTime() - second.instant.getTime(),
      );

    if (exactCandidates[0]) {
      return exactCandidates[0].instant;
    }

    // A local time can be absent during a forward DST transition. Match the
    // common "compatible" behavior by moving it forward by the size of the gap.
    const candidateAfterGap = candidates
      .filter(({ localDifference }) => localDifference > 0)
      .sort(
        (first, second) =>
          first.localDifference - second.localDifference ||
          first.instant.getTime() - second.instant.getTime(),
      )[0];

    if (candidateAfterGap) {
      return candidateAfterGap.instant;
    }

    throw new BadRequestException(
      'Unable to resolve scheduledTime in X-Time-Zone',
    );
  }

  private timeZoneOffsetAt(instant: Date, timeZone: string): number {
    const representedLocalEpoch = this.localEpochFromParts(
      this.zonedDateTimeParts(instant, timeZone),
    );
    const wholeSecondInstant = Math.floor(instant.getTime() / 1000) * 1000;

    return representedLocalEpoch - wholeSecondInstant;
  }

  private zonedDateTimeParts(
    instant: Date,
    timeZone: string,
  ): ZonedDateTimeParts {
    let formatter = this.dateTimeFormatters.get(timeZone);

    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US-u-ca-iso8601', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
      this.dateTimeFormatters.set(timeZone, formatter);
    }

    const numericParts: Record<string, number> = {};

    for (const part of formatter.formatToParts(instant)) {
      if (part.type !== 'literal') {
        numericParts[part.type] = Number(part.value);
      }
    }

    return {
      year: numericParts.year,
      month: numericParts.month,
      day: numericParts.day,
      hour: numericParts.hour,
      minute: numericParts.minute,
      second: numericParts.second,
    };
  }

  private localEpochFromParts(parts: ZonedDateTimeParts): number {
    return Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
  }

  private dateKeyFromParts(parts: ZonedDateTimeParts): string {
    return [
      parts.year,
      String(parts.month).padStart(2, '0'),
      String(parts.day).padStart(2, '0'),
    ].join('-');
  }

  private addCalendarDays(dateKey: string, days: number): string {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days))
      .toISOString()
      .slice(0, 10);
  }

  private withTimeZone<T extends object>(medication: T, timeZone: string) {
    return {
      ...medication,
      timeZone,
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

    throw new Error('Serializable medication transaction retry exhausted');
  }
}
