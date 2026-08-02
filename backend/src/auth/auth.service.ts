import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  User,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          email: registerDto.email,
        },
      });

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists',
      );
    }

    const passwordHash = await bcrypt.hash(
      registerDto.password,
      12,
    );

    const user = await this.prisma.user.create({
      data: {
        name: registerDto.name,
        email: registerDto.email,
        passwordHash,
        role: UserRole.PATIENT,
        patient: {
          create: {},
        },
      },
    });

    return this.createAuthenticationResponse(user);
  }

  async login(loginDto: LoginDto) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          email: loginDto.email,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const passwordIsCorrect =
      await bcrypt.compare(
        loginDto.password,
        user.passwordHash,
      );

    if (!passwordIsCorrect) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    return this.createAuthenticationResponse(user);
  }

  private async createAuthenticationResponse(
    user: User,
  ) {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken =
      await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }
}