import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SecurityEventsQueryDto } from './dto/security-events-query.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    accountStatus: string;
    emailVerifiedAt: Date | null;
    createdAt: Date;
  };
}

const REFRESH_COOKIE_NAME = 'caretrack_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const authentication = await this.authService.register(
      registerDto,
      this.sessionContext(request),
    );
    this.setRefreshCookie(response, authentication);

    return this.publicAuthenticationResponse(authentication);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const authentication = await this.authService.login(
      loginDto,
      this.sessionContext(request),
    );
    this.setRefreshCookie(response, authentication);

    return this.publicAuthenticationResponse(authentication);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const authentication = await this.authService.refresh(
      this.readRefreshCookie(request),
      this.sessionContext(request),
    );
    this.setRefreshCookie(response, authentication);

    return this.publicAuthenticationResponse(authentication);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(
      this.readRefreshCookie(request),
      this.sessionContext(request),
    );
    response.clearCookie(REFRESH_COOKIE_NAME, this.refreshCookieOptions());
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    return this.authService.forgotPassword(dto, this.sessionContext(request));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    return this.authService.resetPassword(dto, this.sessionContext(request));
  }

  @Post('email-verification/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirmEmailVerification(
    @Body() dto: VerifyEmailDto,
    @Req() request: Request,
  ) {
    return this.authService.confirmEmailVerification(
      dto,
      this.sessionContext(request),
    );
  }

  @Post('email-verification/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestEmailVerification(@Req() request: AuthenticatedRequest) {
    return this.authService.requestEmailVerification(request.user.id);
  }

  @Post('email-verification/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendEmailVerification(@Body() dto: ForgotPasswordDto) {
    return this.authService.resendEmailVerification(dto);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  listSessions(@Req() request: AuthenticatedRequest) {
    return this.authService.listSessions(
      request.user.id,
      this.readRefreshCookie(request),
    );
  }

  @Get('security-events')
  @UseGuards(JwtAuthGuard)
  listSecurityEvents(
    @Req() request: AuthenticatedRequest,
    @Query() query: SecurityEventsQueryDto,
  ) {
    return this.authService.listSecurityEvents(request.user.id, query.limit);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.changePassword(
      request.user.id,
      dto,
      this.sessionContext(request),
    );
    response.clearCookie(REFRESH_COOKIE_NAME, this.refreshCookieOptions());
    return result;
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.authService.revokeSession(
      request.user.id,
      sessionId,
      this.sessionContext(request),
    );
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  revokeOtherSessions(@Req() request: AuthenticatedRequest) {
    return this.authService.revokeOtherSessions(
      request.user.id,
      this.readRefreshCookie(request),
      this.sessionContext(request),
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return {
      user: {
        id: request.user.id,
        name: request.user.name,
        email: request.user.email,
        role: request.user.role,
        accountStatus: request.user.accountStatus,
        emailVerified: Boolean(request.user.emailVerifiedAt),
        createdAt: request.user.createdAt,
      },
    };
  }

  private sessionContext(request: Request) {
    return {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }

  private setRefreshCookie(
    response: Response,
    authentication: {
      user: unknown;
      refreshToken?: string;
      refreshTokenExpiresAt?: Date;
    },
  ): void {
    if (!authentication.refreshToken) {
      return;
    }

    response.cookie(REFRESH_COOKIE_NAME, authentication.refreshToken, {
      ...this.refreshCookieOptions(),
      expires: authentication.refreshTokenExpiresAt,
    });
  }

  private refreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure:
        this.config.get<string>('COOKIE_SECURE') === 'true' ||
        this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return undefined;
    }

    for (const part of cookieHeader.split(';')) {
      const separatorIndex = part.indexOf('=');
      const name = part.slice(0, separatorIndex).trim();

      if (name !== REFRESH_COOKIE_NAME) {
        continue;
      }

      try {
        return decodeURIComponent(part.slice(separatorIndex + 1).trim());
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  private publicAuthenticationResponse(authentication: {
    accessToken?: string;
    requiresEmailVerification?: boolean;
    user: unknown;
  }) {
    return {
      ...(authentication.accessToken
        ? { accessToken: authentication.accessToken }
        : {}),
      ...(authentication.requiresEmailVerification
        ? { requiresEmailVerification: true }
        : {}),
      user: authentication.user,
    };
  }
}
