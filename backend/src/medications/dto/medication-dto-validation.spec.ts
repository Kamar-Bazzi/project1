import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateMedicationDto } from './create-medication.dto';
import { UpdateMedicationDto } from './update-medication.dto';

const validMedication = {
  name: 'Metformin',
  dosage: '500 mg',
  instructions: 'With food',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  schedules: [
    { scheduledTime: '08:00', frequency: 'DAILY' },
    { scheduledTime: '20:00', frequency: 'DAILY' },
  ],
};

describe('medication DTO validation', () => {
  it('accepts and trims a valid medication with multiple schedules', async () => {
    const dto = plainToInstance(CreateMedicationDto, {
      ...validMedication,
      name: '  Metformin  ',
      schedules: [{ scheduledTime: '08:00', frequency: 'DAILY' }],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Metformin');
    expect(dto.schedules[0].frequency).toBe('DAILY');
  });

  it('rejects duplicate or malformed scheduled times', async () => {
    const dto = plainToInstance(CreateMedicationDto, {
      ...validMedication,
      schedules: [
        { scheduledTime: '8:00', frequency: 'DAILY' },
        { scheduledTime: '8:00', frequency: 'DAILY' },
      ],
    });

    const errors = await validate(dto);
    const schedulesError = errors.find(
      ({ property }) => property === 'schedules',
    );

    expect(schedulesError).toBeDefined();
    expect(schedulesError?.constraints).toHaveProperty('arrayUnique');
    expect(
      schedulesError?.children?.[0].children?.[0].constraints,
    ).toHaveProperty('matches');
  });

  it('requires between one and eight schedules', async () => {
    const noSchedules = plainToInstance(CreateMedicationDto, {
      ...validMedication,
      schedules: [],
    });
    const tooManySchedules = plainToInstance(CreateMedicationDto, {
      ...validMedication,
      schedules: Array.from({ length: 9 }, (_, index) => ({
        scheduledTime: `${String(index).padStart(2, '0')}:00`,
        frequency: 'DAILY',
      })),
    });

    const [noScheduleErrors, tooManyScheduleErrors] = await Promise.all([
      validate(noSchedules),
      validate(tooManySchedules),
    ]);

    expect(noScheduleErrors[0].constraints).toHaveProperty('arrayMinSize');
    expect(tooManyScheduleErrors[0].constraints).toHaveProperty('arrayMaxSize');
  });

  it('rejects invalid date-only values and a reversed date range', async () => {
    const invalidDate = plainToInstance(CreateMedicationDto, {
      ...validMedication,
      startDate: '2026-02-30',
    });
    const reversedRange = plainToInstance(CreateMedicationDto, {
      ...validMedication,
      startDate: '2026-09-01',
      endDate: '2026-08-31',
    });

    const [invalidDateErrors, reversedRangeErrors] = await Promise.all([
      validate(invalidDate),
      validate(reversedRange),
    ]);

    expect(
      invalidDateErrors.find(({ property }) => property === 'startDate'),
    ).toBeDefined();
    expect(
      reversedRangeErrors.find(({ property }) => property === 'endDate')
        ?.constraints,
    ).toHaveProperty('endDateOnOrAfterStartDate');
  });

  it.each(['Daily', 'WEEKLY', 'AS_NEEDED', ' DAILY '])(
    'rejects unsupported frequency %s',
    async (frequency) => {
      const dto = plainToInstance(CreateMedicationDto, {
        ...validMedication,
        schedules: [{ scheduledTime: '08:00', frequency }],
      });

      const errors = await validate(dto);
      const frequencyErrors = errors
        .find(({ property }) => property === 'schedules')
        ?.children?.[0].children?.find(
          ({ property }) => property === 'frequency',
        );

      expect(frequencyErrors?.constraints).toHaveProperty('equals');
    },
  );

  it('allows nullable optional fields and validates update status', async () => {
    const nullableFields = plainToInstance(CreateMedicationDto, {
      ...validMedication,
      instructions: null,
      endDate: null,
    });
    const invalidUpdate = plainToInstance(UpdateMedicationDto, {
      status: 'ARCHIVED',
    });

    await expect(validate(nullableFields)).resolves.toHaveLength(0);
    expect(
      (await validate(invalidUpdate)).find(
        ({ property }) => property === 'status',
      ),
    ).toBeDefined();
  });

  it.each(['name', 'dosage', 'startDate', 'status', 'schedules'])(
    'rejects explicit null for non-nullable update field %s',
    async (field) => {
      const dto = plainToInstance(UpdateMedicationDto, {
        [field]: null,
      });

      const errors = await validate(dto);

      expect(errors.find(({ property }) => property === field)).toBeDefined();
    },
  );
});
