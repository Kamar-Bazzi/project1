import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Measurement, MeasurementType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MeasurementsService } from './measurements.service';

describe('MeasurementsService', () => {
  const measurement: Measurement = {
    id: 'measurement-1',
    patientId: 'patient-1',
    type: MeasurementType.WEIGHT,
    value: 72.4,
    secondaryValue: null,
    unit: 'kg',
    measuredAt: new Date('2026-01-01T10:00:00.000Z'),
    createdAt: new Date('2026-01-01T10:01:00.000Z'),
    updatedAt: new Date('2026-01-01T10:01:00.000Z'),
  };

  const patientFindUnique = jest.fn();
  const measurementFindMany = jest.fn();
  const measurementFindFirst = jest.fn();
  const measurementCreate = jest.fn();
  const measurementUpdate = jest.fn();
  const measurementDeleteMany = jest.fn();
  const transaction = {
    measurement: {
      findFirst: measurementFindFirst,
      update: measurementUpdate,
    },
  };
  const runTransaction = jest.fn(
    (callback: (client: typeof transaction) => unknown) =>
      Promise.resolve(callback(transaction)),
  );
  const prisma = {
    patient: { findUnique: patientFindUnique },
    measurement: {
      findMany: measurementFindMany,
      findFirst: measurementFindFirst,
      create: measurementCreate,
      update: measurementUpdate,
      deleteMany: measurementDeleteMany,
    },
    $transaction: runTransaction,
  };
  const service = new MeasurementsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    patientFindUnique.mockResolvedValue({ id: 'patient-1' });
  });

  it('lists only the authenticated patient measurements, newest first', async () => {
    measurementFindMany.mockResolvedValue([measurement]);

    await expect(service.findAllForPatient('user-1')).resolves.toEqual([
      measurement,
    ]);
    expect(measurementFindMany).toHaveBeenCalledWith({
      where: { patientId: 'patient-1' },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('does not reveal a measurement belonging to another patient', async () => {
    measurementFindFirst.mockResolvedValue(null);

    await expect(
      service.findOneForPatient('user-1', 'foreign-measurement'),
    ).rejects.toEqual(new NotFoundException('Measurement not found'));
    expect(measurementFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-measurement',
        patientId: 'patient-1',
      },
    });
  });

  it('rejects blood pressure without a secondary value', async () => {
    await expect(
      service.createForPatient('user-1', {
        type: MeasurementType.BLOOD_PRESSURE,
        value: 120,
        unit: 'mmHg',
        measuredAt: '2026-01-01T10:00:00.000Z',
      }),
    ).rejects.toEqual(
      new BadRequestException(
        'secondaryValue is required for blood pressure measurements',
      ),
    );
    expect(measurementCreate).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical unit when creating a measurement', async () => {
    await expect(
      service.createForPatient('user-1', {
        type: MeasurementType.WEIGHT,
        value: 72.4,
        unit: 'lbs',
        measuredAt: '2026-01-01T10:00:00.000Z',
      }),
    ).rejects.toEqual(
      new BadRequestException('unit must be "kg" for WEIGHT measurements'),
    );
    expect(measurementCreate).not.toHaveBeenCalled();
  });

  it('enforces type-specific ranges and blood-pressure ordering', async () => {
    await expect(
      service.createForPatient('user-1', {
        type: MeasurementType.OXYGEN_SATURATION,
        value: 500,
        unit: '%',
        measuredAt: '2026-01-01T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createForPatient('user-1', {
        type: MeasurementType.BLOOD_PRESSURE,
        value: 80,
        secondaryValue: 120,
        unit: 'mmHg',
        measuredAt: '2026-01-01T10:00:00.000Z',
      }),
    ).rejects.toEqual(
      new BadRequestException(
        'blood pressure value must be greater than secondaryValue',
      ),
    );
    expect(measurementCreate).not.toHaveBeenCalled();
  });

  it('rejects secondaryValue for measurements other than blood pressure', async () => {
    await expect(
      service.createForPatient('user-1', {
        type: MeasurementType.WEIGHT,
        value: 72.4,
        secondaryValue: 12,
        unit: 'kg',
        measuredAt: '2026-01-01T10:00:00.000Z',
      }),
    ).rejects.toEqual(
      new BadRequestException(
        'secondaryValue is only valid for blood pressure measurements',
      ),
    );
  });

  it('validates the merged record when changing measurement type', async () => {
    measurementFindFirst.mockResolvedValue(measurement);

    await expect(
      service.updateForPatient('user-1', measurement.id, {
        type: MeasurementType.BLOOD_PRESSURE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(measurementUpdate).not.toHaveBeenCalled();
  });

  it('rejects changing type without its matching canonical unit', async () => {
    measurementFindFirst.mockResolvedValue(measurement);

    await expect(
      service.updateForPatient('user-1', measurement.id, {
        type: MeasurementType.TEMPERATURE,
      }),
    ).rejects.toEqual(
      new BadRequestException('unit must be "°C" for TEMPERATURE measurements'),
    );
    expect(measurementUpdate).not.toHaveBeenCalled();
  });

  it('clears an omitted secondary value when moving away from blood pressure', async () => {
    measurementFindFirst.mockResolvedValue({
      ...measurement,
      type: MeasurementType.BLOOD_PRESSURE,
      value: 120,
      secondaryValue: 80,
      unit: 'mmHg',
    });
    measurementUpdate.mockResolvedValue({
      ...measurement,
      type: MeasurementType.HEART_RATE,
      value: 75,
      unit: 'bpm',
    });

    await service.updateForPatient('user-1', measurement.id, {
      type: MeasurementType.HEART_RATE,
      value: 75,
      unit: 'bpm',
    });

    expect(measurementUpdate).toHaveBeenCalledWith({
      where: {
        id: measurement.id,
        patientId: 'patient-1',
      },
      data: {
        type: MeasurementType.HEART_RATE,
        value: 75,
        unit: 'bpm',
        secondaryValue: null,
      },
    });
  });

  it('allows explicitly clearing secondaryValue outside blood pressure', async () => {
    measurementFindFirst.mockResolvedValue({
      ...measurement,
      secondaryValue: 12,
    });
    measurementUpdate.mockResolvedValue({
      ...measurement,
      secondaryValue: null,
    });

    await service.updateForPatient('user-1', measurement.id, {
      secondaryValue: null,
    });

    expect(measurementUpdate).toHaveBeenCalledWith({
      where: {
        id: measurement.id,
        patientId: 'patient-1',
      },
      data: { secondaryValue: null },
    });
  });

  it('retries a serializable update conflict against fresh state', async () => {
    runTransaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    measurementFindFirst.mockResolvedValue(measurement);
    measurementUpdate.mockResolvedValue({ ...measurement, value: 73 });

    await expect(
      service.updateForPatient('user-1', measurement.id, { value: 73 }),
    ).resolves.toEqual({ ...measurement, value: 73 });

    expect(runTransaction).toHaveBeenCalledTimes(2);
  });

  it('returns 404 before querying measurements when no patient exists', async () => {
    patientFindUnique.mockResolvedValue(null);

    await expect(service.findAllForPatient('user-1')).rejects.toEqual(
      new NotFoundException('Patient profile not found'),
    );
    expect(measurementFindMany).not.toHaveBeenCalled();
  });

  it('returns 404 when a scoped measurement delete affects no row', async () => {
    measurementDeleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.deleteForPatient('user-1', 'missing-measurement'),
    ).rejects.toEqual(new NotFoundException('Measurement not found'));
    expect(measurementDeleteMany).toHaveBeenCalledWith({
      where: {
        id: 'missing-measurement',
        patientId: 'patient-1',
      },
    });
  });
});
