import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Measurement, MeasurementType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { UpdateMeasurementDto } from './dto/update-measurement.dto';

const CANONICAL_MEASUREMENT_UNITS: Record<MeasurementType, string> = {
  [MeasurementType.BLOOD_PRESSURE]: 'mmHg',
  [MeasurementType.TEMPERATURE]: '°C',
  [MeasurementType.WEIGHT]: 'kg',
  [MeasurementType.BLOOD_GLUCOSE]: 'mg/dL',
  [MeasurementType.HEART_RATE]: 'bpm',
  [MeasurementType.OXYGEN_SATURATION]: '%',
};
const PRIMARY_VALUE_RANGES: Record<
  MeasurementType,
  { minimum: number; maximum: number }
> = {
  [MeasurementType.BLOOD_PRESSURE]: { minimum: 40, maximum: 300 },
  [MeasurementType.TEMPERATURE]: { minimum: 20, maximum: 50 },
  [MeasurementType.WEIGHT]: { minimum: 0.1, maximum: 1_000 },
  [MeasurementType.BLOOD_GLUCOSE]: { minimum: 1, maximum: 2_000 },
  [MeasurementType.HEART_RATE]: { minimum: 10, maximum: 350 },
  [MeasurementType.OXYGEN_SATURATION]: { minimum: 1, maximum: 100 },
};
const DIASTOLIC_BLOOD_PRESSURE_RANGE = { minimum: 20, maximum: 200 };
const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class MeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForPatient(userId: string): Promise<Measurement[]> {
    const patientId = await this.getPatientId(userId);

    return this.prisma.measurement.findMany({
      where: { patientId },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOneForPatient(
    userId: string,
    measurementId: string,
  ): Promise<Measurement> {
    const patientId = await this.getPatientId(userId);
    const measurement = await this.prisma.measurement.findFirst({
      where: {
        id: measurementId,
        patientId,
      },
    });

    if (!measurement) {
      throw new NotFoundException('Measurement not found');
    }

    return measurement;
  }

  async createForPatient(
    userId: string,
    createDto: CreateMeasurementDto,
  ): Promise<Measurement> {
    const patientId = await this.getPatientId(userId);

    this.assertMeasurementValues(
      createDto.type,
      createDto.value,
      createDto.secondaryValue,
    );
    this.assertCanonicalUnit(createDto.type, createDto.unit);

    return this.prisma.measurement.create({
      data: {
        patientId,
        type: createDto.type,
        value: createDto.value,
        secondaryValue: createDto.secondaryValue ?? null,
        unit: createDto.unit,
        measuredAt: new Date(createDto.measuredAt),
      },
    });
  }

  async updateForPatient(
    userId: string,
    measurementId: string,
    updateDto: UpdateMeasurementDto,
  ): Promise<Measurement> {
    const patientId = await this.getPatientId(userId);
    return this.runSerializableTransaction(async (transaction) => {
      const existingMeasurement = await transaction.measurement.findFirst({
        where: {
          id: measurementId,
          patientId,
        },
      });

      if (!existingMeasurement) {
        throw new NotFoundException('Measurement not found');
      }

      const resultingType = updateDto.type ?? existingMeasurement.type;
      const resultingUnit = updateDto.unit ?? existingMeasurement.unit;
      const resultingValue = updateDto.value ?? existingMeasurement.value;
      const isResultingBloodPressure =
        resultingType === MeasurementType.BLOOD_PRESSURE;
      const resultingSecondaryValue = isResultingBloodPressure
        ? updateDto.secondaryValue === undefined
          ? existingMeasurement.secondaryValue
          : updateDto.secondaryValue
        : null;

      if (
        !isResultingBloodPressure &&
        updateDto.secondaryValue !== undefined &&
        updateDto.secondaryValue !== null
      ) {
        throw new BadRequestException(
          'secondaryValue is only valid for blood pressure measurements',
        );
      }

      this.assertCanonicalUnit(resultingType, resultingUnit);
      this.assertMeasurementValues(
        resultingType,
        resultingValue,
        resultingSecondaryValue,
      );

      const data: Prisma.MeasurementUpdateInput = {};

      if (updateDto.type !== undefined) {
        data.type = updateDto.type;
      }

      if (updateDto.value !== undefined) {
        data.value = updateDto.value;
      }

      if (updateDto.secondaryValue !== undefined) {
        data.secondaryValue = updateDto.secondaryValue;
      } else if (
        !isResultingBloodPressure &&
        existingMeasurement.secondaryValue !== null
      ) {
        data.secondaryValue = null;
      }

      if (updateDto.unit !== undefined) {
        data.unit = updateDto.unit;
      }

      if (updateDto.measuredAt !== undefined) {
        data.measuredAt = new Date(updateDto.measuredAt);
      }

      return transaction.measurement.update({
        where: {
          id: existingMeasurement.id,
          patientId,
        },
        data,
      });
    });
  }

  async deleteForPatient(userId: string, measurementId: string): Promise<void> {
    const patientId = await this.getPatientId(userId);
    const result = await this.prisma.measurement.deleteMany({
      where: {
        id: measurementId,
        patientId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Measurement not found');
    }
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

  private assertMeasurementValues(
    type: MeasurementType,
    value: number,
    secondaryValue: number | null | undefined,
  ): void {
    const primaryRange = PRIMARY_VALUE_RANGES[type];

    if (value < primaryRange.minimum || value > primaryRange.maximum) {
      throw new BadRequestException(
        `value must be between ${primaryRange.minimum} and ${primaryRange.maximum} for ${type} measurements`,
      );
    }

    if (type !== MeasurementType.BLOOD_PRESSURE) {
      if (secondaryValue != null) {
        throw new BadRequestException(
          'secondaryValue is only valid for blood pressure measurements',
        );
      }

      return;
    }

    if (secondaryValue == null) {
      throw new BadRequestException(
        'secondaryValue is required for blood pressure measurements',
      );
    }

    if (
      secondaryValue < DIASTOLIC_BLOOD_PRESSURE_RANGE.minimum ||
      secondaryValue > DIASTOLIC_BLOOD_PRESSURE_RANGE.maximum
    ) {
      throw new BadRequestException(
        `secondaryValue must be between ${DIASTOLIC_BLOOD_PRESSURE_RANGE.minimum} and ${DIASTOLIC_BLOOD_PRESSURE_RANGE.maximum} for blood pressure measurements`,
      );
    }

    if (value <= secondaryValue) {
      throw new BadRequestException(
        'blood pressure value must be greater than secondaryValue',
      );
    }
  }

  private assertCanonicalUnit(type: MeasurementType, unit: string): void {
    const canonicalUnit = CANONICAL_MEASUREMENT_UNITS[type];

    if (unit !== canonicalUnit) {
      throw new BadRequestException(
        `unit must be "${canonicalUnit}" for ${type} measurements`,
      );
    }
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

    throw new Error('Serializable measurement transaction retry exhausted');
  }
}
