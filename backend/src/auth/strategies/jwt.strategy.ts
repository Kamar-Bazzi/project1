import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';

import { PrismaService } from '../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  sid?: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly requireVerifiedEmail: boolean;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      issuer: configService.get<string>('JWT_ISSUER') || undefined,
      audience: configService.get<string>('JWT_AUDIENCE') || undefined,
    });
    this.requireVerifiedEmail =
      configService.get<string>('AUTH_REQUIRE_VERIFIED_EMAIL') === 'true';
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid access token');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        accountStatus: true,
        emailVerifiedAt: true,
        passwordChangedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    if (this.requireVerifiedEmail && !user.emailVerifiedAt) {
      throw new UnauthorizedException('Email verification required');
    }

    if (
      user.passwordChangedAt &&
      payload.iat &&
      payload.iat * 1000 + 999 < user.passwordChangedAt.getTime()
    ) {
      throw new UnauthorizedException('Access token predates password change');
    }

    if (payload.sid) {
      const session = await this.prisma.authSession.findFirst({
        where: {
          id: payload.sid,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });

      if (!session) {
        throw new UnauthorizedException('Session is no longer active');
      }
    }

    return user;
  }
}
