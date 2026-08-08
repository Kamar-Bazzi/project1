import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  const findUniqueUser = jest.fn();
  const createUser = jest.fn();
  const registerDto: RegisterDto = {
    name: 'Test Patient',
    email: 'patient@example.com',
    password: 'ValidPass1',
  };

  beforeEach(async () => {
    findUniqueUser.mockReset();
    createUser.mockReset();
    findUniqueUser.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: findUniqueUser,
              create: createUser,
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('maps a concurrent unique-email conflict to ConflictException', async () => {
    createUser.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(authService.register(registerDto)).rejects.toEqual(
      new ConflictException('An account with this email already exists'),
    );
  });

  it('preserves non-unique Prisma errors', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: 'test',
      },
    );
    createUser.mockRejectedValue(prismaError);

    await expect(authService.register(registerDto)).rejects.toBe(prismaError);
  });
});
