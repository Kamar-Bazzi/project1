import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdatePatientProfileDto } from './update-patient-profile.dto';

describe('UpdatePatientProfileDto', () => {
  it('trims editable text fields and accepts nullable patient details', async () => {
    const dto = plainToInstance(UpdatePatientProfileDto, {
      name: '  Test Patient  ',
      dateOfBirth: null,
      phoneNumber: '  +961 01 234 567  ',
      emergencyContact: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Test Patient');
    expect(dto.phoneNumber).toBe('+961 01 234 567');
  });

  it('leaves timezone-aware future-date validation to the service', async () => {
    const dto = plainToInstance(UpdatePatientProfileDto, {
      dateOfBirth: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires a date-only birth date and normalizes blank contact fields', async () => {
    const dateTimeDto = plainToInstance(UpdatePatientProfileDto, {
      dateOfBirth: '2000-01-01T00:00:00+14:00',
    });
    const blankContactDto = plainToInstance(UpdatePatientProfileDto, {
      phoneNumber: '   ',
      emergencyContact: '\t',
    });

    expect(
      (await validate(dateTimeDto)).map(({ property }) => property),
    ).toContain('dateOfBirth');
    await expect(validate(blankContactDto)).resolves.toHaveLength(0);
    expect(blankContactDto.phoneNumber).toBeNull();
    expect(blankContactDto.emergencyContact).toBeNull();
  });

  it.each(['2021-02-29', '2020-02-30', '0000-01-01'])(
    'rejects impossible or unsupported birth date %s',
    async (dateOfBirth) => {
      const dto = plainToInstance(UpdatePatientProfileDto, { dateOfBirth });

      expect((await validate(dto)).map(({ property }) => property)).toContain(
        'dateOfBirth',
      );
    },
  );

  it('rejects null or whitespace-only names', async () => {
    const nullName = plainToInstance(UpdatePatientProfileDto, { name: null });
    const blankName = plainToInstance(UpdatePatientProfileDto, {
      name: '   ',
    });

    expect(
      (await validate(nullName)).map(({ property }) => property),
    ).toContain('name');
    expect(
      (await validate(blankName)).map(({ property }) => property),
    ).toContain('name');
  });

  it('accepts a valid IANA timezone and rejects invalid or null values', async () => {
    const validTimeZone = plainToInstance(UpdatePatientProfileDto, {
      timeZone: '  Asia/Beirut  ',
    });
    const invalidTimeZone = plainToInstance(UpdatePatientProfileDto, {
      timeZone: 'Mars/Olympus_Mons',
    });
    const nullTimeZone = plainToInstance(UpdatePatientProfileDto, {
      timeZone: null,
    });

    await expect(validate(validTimeZone)).resolves.toHaveLength(0);
    expect(validTimeZone.timeZone).toBe('Asia/Beirut');
    expect(
      (await validate(invalidTimeZone)).map(({ property }) => property),
    ).toContain('timeZone');
    expect(
      (await validate(nullTimeZone)).map(({ property }) => property),
    ).toContain('timeZone');
  });
});
