import { WearableProvider } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateWearableDto } from './create-wearable.dto';
import { UpdateWearableDto } from './update-wearable.dto';

const validationOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
};

describe('wearable DTO validation', () => {
  it('accepts a mock connection and trims its display name', async () => {
    const dto = plainToInstance(CreateWearableDto, {
      provider: WearableProvider.MOCK,
      deviceName: '  Demo Watch  ',
    });

    await expect(validate(dto, validationOptions)).resolves.toHaveLength(0);
    expect(dto.deviceName).toBe('Demo Watch');
  });

  it('rejects invalid provider values', async () => {
    const dto = plainToInstance(CreateWearableDto, {
      provider: 'NOT_A_PROVIDER',
    });

    await expect(validate(dto, validationOptions)).resolves.not.toHaveLength(0);
  });

  it('rejects patientId and external device identifiers from the browser', async () => {
    const dto = plainToInstance(CreateWearableDto, {
      provider: WearableProvider.MOCK,
      patientId: 'patient-b',
      externalDeviceId: 'spoofed-device',
    });
    const errors = await validate(dto, validationOptions);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['patientId', 'externalDeviceId']),
    );
  });

  it('rejects an empty or overlong device name', async () => {
    const emptyName = plainToInstance(UpdateWearableDto, {
      deviceName: '   ',
    });
    const longName = plainToInstance(UpdateWearableDto, {
      deviceName: 'w'.repeat(101),
    });

    await expect(
      validate(emptyName, validationOptions),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(longName, validationOptions),
    ).resolves.not.toHaveLength(0);
  });

  it('requires active to be a boolean', async () => {
    const dto = plainToInstance(UpdateWearableDto, { active: 'false' });

    await expect(validate(dto, validationOptions)).resolves.not.toHaveLength(0);
  });

  it('rejects null for optional fields backed by non-null database columns', async () => {
    const create = plainToInstance(CreateWearableDto, {
      provider: WearableProvider.MOCK,
      deviceName: null,
    });
    const update = plainToInstance(UpdateWearableDto, {
      deviceName: null,
      active: null,
    });

    expect((await validate(create)).map(({ property }) => property)).toContain(
      'deviceName',
    );
    expect((await validate(update)).map(({ property }) => property)).toEqual(
      expect.arrayContaining(['deviceName', 'active']),
    );
  });
});
