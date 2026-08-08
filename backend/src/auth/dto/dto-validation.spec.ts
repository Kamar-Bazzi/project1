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
});
