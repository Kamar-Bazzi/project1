import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  AppointmentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';

import { canonicalizeIanaTimeZone } from '../common/validators/is-iana-time-zone.validator';
import { PrismaService } from '../prisma/prisma.service';
import type { AppointmentActor } from './appointments.service';
import {
  addLocalDays,
  localMinuteToUtc,
  zonedMinuteParts,
} from './availability-time';
import { AvailableSlotQueryDto } from './dto/available-slot-query.dto';
import { UpdateDoctorAvailabilityDto } from './dto/update-doctor-availability.dto';

const MAX_SLOT_RANGE_MILLISECONDS = 31 * 24 * 60 * 60 * 1_000;

const availabilitySelect = {
  id: true,
  timeZone: true,
  slotDurationMinutes: true,
  availabilityWindows: {
    select: {
      id: true,
      dayOfWeek: true,
      startMinute: true,
      endMinute: true,
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
  },
} satisfies Prisma.DoctorSelect;

export interface BookableAppointmentRange {
  appointmentEnd: Date;
  durationMinutes: number;
}

@Injectable()
export class DoctorAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: availabilitySelect,
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    return this.serializeAvailability(doctor);
  }

  async replaceMine(userId: string, dto: UpdateDoctorAvailabilityDto) {
    this.assertNonOverlappingWindows(dto.windows);
    const timeZone = canonicalizeIanaTimeZone(dto.timeZone);
    if (!timeZone) {
      throw new BadRequestException('timeZone must be a valid IANA timezone');
    }

    return this.prisma.$transaction(async (transaction) => {
      const doctor = await transaction.doctor.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!doctor) throw new NotFoundException('Doctor profile not found');

      await transaction.doctor.update({
        where: { id: doctor.id },
        data: {
          timeZone,
          slotDurationMinutes: dto.slotDurationMinutes,
        },
      });
      await transaction.doctorAvailability.deleteMany({
        where: { doctorId: doctor.id },
      });
      if (dto.windows.length > 0) {
        await transaction.doctorAvailability.createMany({
          data: dto.windows.map((window) => ({
            doctorId: doctor.id,
            dayOfWeek: window.dayOfWeek,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'DOCTOR_AVAILABILITY_UPDATED',
          entity: 'Doctor',
          entityId: doctor.id,
          metadata: {
            timeZone,
            slotDurationMinutes: dto.slotDurationMinutes,
            windowCount: dto.windows.length,
          },
        },
      });

      const updated = await transaction.doctor.findUnique({
        where: { id: doctor.id },
        select: availabilitySelect,
      });
      if (!updated) throw new NotFoundException('Doctor profile not found');
      return this.serializeAvailability(updated);
    });
  }

  async listAvailableSlots(
    actor: AppointmentActor,
    doctorId: string,
    query: AvailableSlotQueryDto,
  ) {
    const requestedFrom = new Date(query.from);
    const requestedTo = new Date(query.to);
    this.assertSlotRange(requestedFrom, requestedTo);

    const patient =
      actor.role === UserRole.PATIENT
        ? await this.prisma.patient.findUnique({
            where: { userId: actor.id },
            select: { id: true },
          })
        : null;
    if (actor.role === UserRole.PATIENT && !patient) {
      throw new NotFoundException('Patient profile not found');
    }

    const doctor = await this.prisma.doctor.findFirst({
      where: {
        id: doctorId,
        user: {
          role: UserRole.DOCTOR,
          accountStatus: AccountStatus.ACTIVE,
        },
        userId: actor.role === UserRole.DOCTOR ? actor.id : undefined,
        patientAccessGrants:
          actor.role === UserRole.PATIENT
            ? { some: { patientId: patient?.id, active: true } }
            : undefined,
      },
      select: availabilitySelect,
    });
    if (!doctor) {
      throw new NotFoundException('Available doctor not found');
    }

    const now = new Date();
    const from = new Date(Math.max(requestedFrom.getTime(), now.getTime()));
    if (from.getTime() >= requestedTo.getTime()) {
      return this.slotResponse(doctor, []);
    }

    const candidates = this.generateCandidateSlots(doctor, from, requestedTo);
    if (candidates.length === 0) return this.slotResponse(doctor, []);

    const conflicts = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.SCHEDULED,
        appointmentDate: { lt: requestedTo },
        appointmentEnd: { gt: from },
        OR: [
          { doctorId: doctor.id },
          ...(patient ? [{ patientId: patient.id }] : []),
        ],
      },
      select: { appointmentDate: true, appointmentEnd: true },
    });
    const available = candidates.filter(
      (slot) =>
        !conflicts.some(
          (appointment) =>
            appointment.appointmentDate.getTime() < slot.end.getTime() &&
            appointment.appointmentEnd.getTime() > slot.start.getTime(),
        ),
    );

    return this.slotResponse(doctor, available);
  }

  async assertBookable(
    transaction: Prisma.TransactionClient,
    doctorId: string,
    appointmentDate: Date,
    requestedDurationMinutes?: number,
  ): Promise<BookableAppointmentRange> {
    const doctor = await transaction.doctor.findFirst({
      where: {
        id: doctorId,
        user: {
          role: UserRole.DOCTOR,
          accountStatus: AccountStatus.ACTIVE,
        },
      },
      select: availabilitySelect,
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const durationMinutes =
      requestedDurationMinutes ?? doctor.slotDurationMinutes;
    if (durationMinutes !== doctor.slotDurationMinutes) {
      throw new BadRequestException(
        `durationMinutes must match the doctor's ${doctor.slotDurationMinutes}-minute slot duration`,
      );
    }
    if (
      appointmentDate.getUTCSeconds() !== 0 ||
      appointmentDate.getUTCMilliseconds() !== 0
    ) {
      throw new ConflictException(
        'The appointment must start on an available whole-minute slot',
      );
    }

    const local = zonedMinuteParts(appointmentDate, doctor.timeZone);
    const matchingWindow = doctor.availabilityWindows.find(
      (window) =>
        window.dayOfWeek === local.dayOfWeek &&
        local.minuteOfDay >= window.startMinute &&
        local.minuteOfDay + durationMinutes <= window.endMinute &&
        (local.minuteOfDay - window.startMinute) %
          doctor.slotDurationMinutes ===
          0,
    );
    const expectedLocalEnd = localMinuteToUtc(
      local.dateKey,
      local.minuteOfDay + durationMinutes,
      doctor.timeZone,
    );
    const appointmentEnd = new Date(
      appointmentDate.getTime() + durationMinutes * 60 * 1_000,
    );

    if (
      !matchingWindow ||
      !expectedLocalEnd ||
      expectedLocalEnd.getTime() !== appointmentEnd.getTime()
    ) {
      throw new ConflictException(
        "The requested time is outside the doctor's available slots",
      );
    }

    return { appointmentEnd, durationMinutes };
  }

  private generateCandidateSlots(
    doctor: {
      timeZone: string;
      slotDurationMinutes: number;
      availabilityWindows: Array<{
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
      }>;
    },
    from: Date,
    to: Date,
  ): Array<{ start: Date; end: Date }> {
    const slots: Array<{ start: Date; end: Date }> = [];
    let dateKey = zonedMinuteParts(from, doctor.timeZone).dateKey;
    const finalDateKey = zonedMinuteParts(to, doctor.timeZone).dateKey;

    for (let dayCount = 0; dayCount <= 32; dayCount += 1) {
      const midday = localMinuteToUtc(dateKey, 12 * 60, doctor.timeZone);
      if (midday) {
        const dayOfWeek = zonedMinuteParts(midday, doctor.timeZone).dayOfWeek;
        for (const window of doctor.availabilityWindows.filter(
          (candidate) => candidate.dayOfWeek === dayOfWeek,
        )) {
          for (
            let minute = window.startMinute;
            minute + doctor.slotDurationMinutes <= window.endMinute;
            minute += doctor.slotDurationMinutes
          ) {
            const start = localMinuteToUtc(dateKey, minute, doctor.timeZone);
            const end = localMinuteToUtc(
              dateKey,
              minute + doctor.slotDurationMinutes,
              doctor.timeZone,
            );
            if (
              start &&
              end &&
              end.getTime() - start.getTime() ===
                doctor.slotDurationMinutes * 60 * 1_000 &&
              start.getTime() >= from.getTime() &&
              end.getTime() <= to.getTime()
            ) {
              slots.push({ start, end });
            }
          }
        }
      }

      if (dateKey === finalDateKey) break;
      dateKey = addLocalDays(dateKey, 1);
    }

    return slots.sort(
      (first, second) => first.start.getTime() - second.start.getTime(),
    );
  }

  private assertNonOverlappingWindows(
    windows: UpdateDoctorAvailabilityDto['windows'],
  ): void {
    for (const window of windows) {
      if (window.startMinute >= window.endMinute) {
        throw new BadRequestException(
          'Availability window startMinute must be before endMinute',
        );
      }
    }

    const ordered = [...windows].sort(
      (first, second) =>
        first.dayOfWeek - second.dayOfWeek ||
        first.startMinute - second.startMinute ||
        first.endMinute - second.endMinute,
    );
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (
        current.dayOfWeek === previous.dayOfWeek &&
        current.startMinute < previous.endMinute
      ) {
        throw new BadRequestException(
          'Availability windows cannot overlap on the same day',
        );
      }
    }
  }

  private assertSlotRange(from: Date, to: Date): void {
    const range = to.getTime() - from.getTime();
    if (range <= 0) {
      throw new BadRequestException('from must be before to');
    }
    if (range > MAX_SLOT_RANGE_MILLISECONDS) {
      throw new BadRequestException(
        'Available slots may cover at most 31 days',
      );
    }
  }

  private serializeAvailability(doctor: {
    id: string;
    timeZone: string;
    slotDurationMinutes: number;
    availabilityWindows: Array<{
      id: string;
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
    }>;
  }) {
    return {
      doctorId: doctor.id,
      timeZone: doctor.timeZone,
      slotDurationMinutes: doctor.slotDurationMinutes,
      windows: doctor.availabilityWindows,
    };
  }

  private slotResponse(
    doctor: {
      id: string;
      timeZone: string;
      slotDurationMinutes: number;
    },
    slots: Array<{ start: Date; end: Date }>,
  ) {
    return {
      doctorId: doctor.id,
      timeZone: doctor.timeZone,
      durationMinutes: doctor.slotDurationMinutes,
      slots: slots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        durationMinutes: doctor.slotDurationMinutes,
      })),
    };
  }
}
