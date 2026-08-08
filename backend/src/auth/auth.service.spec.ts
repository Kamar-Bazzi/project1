import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
  compare: jest.fn(),
}));

interface CreateUserArguments {
  data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    patient: { create: { timeZone: string } };
  };
}

describe('AuthService', () => {
  let authService: AuthService;
  const findUniqueUser = jest.fn();
  const createUser = jest.fn<Promise<User>, [CreateUserArguments]>();
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

  it.each([
    ['Asia/Beirut', 'Asia/Beirut'],
    [undefined, 'UTC'],
  ])(
    'persists the canonical patient timezone %s as %s',
    async (timeZone, expectedTimeZone) => {
      const createdUser: User = {
        id: 'user-1',
        name: registerDto.name,
        email: registerDto.email,
        passwordHash: 'hashed-password',
        role: UserRole.PATIENT,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      let persistedTimeZone: string | undefined;
      createUser.mockImplementation((arguments_: CreateUserArguments) => {
        persistedTimeZone = arguments_.data.patient.create.timeZone;
        return Promise.resolve(createdUser);
      });

      await authService.register({ ...registerDto, timeZone });

      expect(persistedTimeZone).toBe(expectedTimeZone);
    },
  );
});
