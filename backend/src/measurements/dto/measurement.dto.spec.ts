import { plainToInstance } from 'class-transformer';
import { MeasurementType } from '@prisma/client';
import { validate } from 'class-validator';

import { CreateMeasurementDto } from './create-measurement.dto';
import { UpdateMeasurementDto } from './update-measurement.dto';

describe('measurement DTOs', () => {
  const validMeasurement = {
    type: MeasurementType.WEIGHT,
    value: 72.4,
    unit: 'kg',
    measuredAt: '2026-01-01T10:00:00.000Z',
  };

  it('requires a secondary blood-pressure value', async () => {
    const dto = plainToInstance(CreateMeasurementDto, {
      ...validMeasurement,
      type: MeasurementType.BLOOD_PRESSURE,
      value: 120,
      unit: 'mmHg',
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toContain('secondaryValue');
  });

  it('accepts null secondaryValue for non-blood-pressure measurements', async () => {
    const dto = plainToInstance(CreateMeasurementDto, {
      ...validMeasurement,
      secondaryValue: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects non-sensible values, blank units, and future dates', async () => {
    const dto = plainToInstance(CreateMeasurementDto, {
      ...validMeasurement,
      value: Number.POSITIVE_INFINITY,
      unit: '   ',
      measuredAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const invalidProperties = (await validate(dto)).map(
      ({ property }) => property,
    );

    expect(invalidProperties).toEqual(
      expect.arrayContaining(['value', 'unit', 'measuredAt']),
    );
  });

  it('validates only supplied patch fields and permits clearing secondaryValue', async () => {
    const dto = plainToInstance(UpdateMeasurementDto, {
      secondaryValue: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a measuredAt value without an explicit timezone', async () => {
    const createDto = plainToInstance(CreateMeasurementDto, {
      ...validMeasurement,
      measuredAt: '2026-01-01T10:00:00',
    });
    const updateDto = plainToInstance(UpdateMeasurementDto, {
      measuredAt: '2026-01-01T10:00:00',
    });

    expect(
      (await validate(createDto)).map(({ property }) => property),
    ).toContain('measuredAt');
    expect(
      (await validate(updateDto)).map(({ property }) => property),
    ).toContain('measuredAt');
  });

  it.each([
    '2021-02-29T10:00:00Z',
    '2020-02-30T10:00:00+02:00',
    '0000-01-01T10:00:00Z',
  ])('rejects impossible or unsupported timestamp %s', async (measuredAt) => {
    const dto = plainToInstance(CreateMeasurementDto, {
      ...validMeasurement,
      measuredAt,
    });

    expect((await validate(dto)).map(({ property }) => property)).toContain(
      'measuredAt',
    );
  });
});
