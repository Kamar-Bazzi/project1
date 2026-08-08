import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

describe('authentication DTO transforms', () => {
  it('lets validation reject non-string registration fields', async () => {
    const dto = plainToInstance(RegisterDto, {
      name: 42,
      email: null,
      password: 'ValidPass1',
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['name', 'email']),
    );
  });

  it('lets validation reject a non-string login email', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 42,
      password: 'ValidPass1',
    });

    const errors = await validate(dto);

    expect(errors.map(({ property }) => property)).toContain('email');
  });

  it('accepts a valid registration timezone and rejects an invalid one', async () => {
    const validDto = plainToInstance(RegisterDto, {
      name: 'Test Patient',
      email: 'patient@example.com',
      password: 'ValidPass1',
      timeZone: '  Asia/Beirut  ',
    });
    const invalidDto = plainToInstance(RegisterDto, {
      name: 'Test Patient',
      email: 'patient@example.com',
      password: 'ValidPass1',
      timeZone: 'Not/A-Time-Zone',
    });
    const nullDto = plainToInstance(RegisterDto, {
      name: 'Test Patient',
      email: 'patient@example.com',
      password: 'ValidPass1',
      timeZone: null,
    });

    await expect(validate(validDto)).resolves.toHaveLength(0);
    expect(validDto.timeZone).toBe('Asia/Beirut');
    expect(
      (await validate(invalidDto)).map(({ property }) => property),
    ).toContain('timeZone');
    expect((await validate(nullDto)).map(({ property }) => property)).toContain(
      'timeZone',
    );
  });
});
