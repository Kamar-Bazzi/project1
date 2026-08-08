import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateEmergencyContactDto } from './create-emergency-contact.dto';
import { UpdateEmergencyContactDto } from './update-emergency-contact.dto';

describe('emergency contact DTO validation', () => {
  it('normalizes valid contact text and email', async () => {
    const dto = plainToInstance(CreateEmergencyContactDto, {
      name: '  Alex Doe  ',
      relationship: '  Sibling ',
      phone: ' +961 1 555 555 ',
      email: ' ALEX@Example.com ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      name: 'Alex Doe',
      relationship: 'Sibling',
      phone: '+961 1 555 555',
      email: 'alex@example.com',
    });
  });

  it('rejects malformed contact data', async () => {
    const dto = plainToInstance(CreateEmergencyContactDto, {
      name: '',
      relationship: '',
      phone: 'not-a-phone',
      email: 'not-an-email',
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['name', 'relationship', 'phone', 'email']),
    );
  });

  it('allows clearing an optional email and changing active state', async () => {
    const dto = plainToInstance(UpdateEmergencyContactDto, {
      email: null,
      active: false,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects null for optional fields backed by non-null columns', async () => {
    const create = plainToInstance(CreateEmergencyContactDto, {
      name: 'Alex Doe',
      relationship: 'Sibling',
      phone: '+961 1 555 555',
      active: null,
    });
    const update = plainToInstance(UpdateEmergencyContactDto, {
      name: null,
      relationship: null,
      phone: null,
      active: null,
    });

    expect((await validate(create)).map(({ property }) => property)).toContain(
      'active',
    );
    expect((await validate(update)).map(({ property }) => property)).toEqual(
      expect.arrayContaining(['name', 'relationship', 'phone', 'active']),
    );
  });
});
