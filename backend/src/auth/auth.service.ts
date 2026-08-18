import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AccountStatus,
  NotificationChannelType,
  NotificationDeliveryStatus,
  NotificationType,
  OneTimeTokenPurpose,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  canonicalizeIanaTimeZone,
  DEFAULT_TIME_ZONE,
} from '../common/validators/is-iana-time-zone.validator';
import { EmailNotificationProvider } from '../notifications/providers/email-notification.provider';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  sid?: string;
}

export interface SessionRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

type AuthenticationUser = Pick<
  User,
  | 'id'
  | 'name'
  | 'email'
  | 'role'
  | 'accountStatus'
  | 'emailVerifiedAt'
  | 'createdAt'
>;

const EMAIL_ALREADY_EXISTS = 'An account with this email already exists';
const INVALID_CREDENTIALS = 'Invalid email or password';
const GENERIC_PASSWORD_RESET_RESPONSE =
  'If an active account exists for that address, a reset link has been sent.';
const GENERIC_VERIFICATION_RESPONSE =
  'If verification is needed, a new verification link has been sent.';
const DUMMY_PASSWORD_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEe.4InJ2oX2K5aS9dZ6YvYHh7A5QdQ9j9K';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly emailProvider?: EmailNotificationProvider,
  ) {}

  async register(
    registerDto: RegisterDto,
    context: SessionRequestContext = {},
  ) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException(EMAIL_ALREADY_EXISTS);
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 12);
    let user: User;

    try {
      user = await this.prisma.user.create({
        data: {
          name: registerDto.name,
          email: registerDto.email,
          passwordHash,
          passwordChangedAt: new Date(),
          role: UserRole.PATIENT,
          patient: {
            create: {
              timeZone:
                canonicalizeIanaTimeZone(registerDto.timeZone) ??
                DEFAULT_TIME_ZONE,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(EMAIL_ALREADY_EXISTS);
      }

      throw error;
    }

    await this.recordAuthAudit(user.id, 'ACCOUNT_REGISTERED', context, {
      role: user.role,
    });
    await this.issueOneTimeToken(user, OneTimeTokenPurpose.EMAIL_VERIFICATION);

    if (this.requiresVerifiedEmail()) {
      return {
        requiresEmailVerification: true as const,
        user: this.toPublicUser(user),
      };
    }

    return this.createAuthenticationResponse(user, context);
  }

  async login(loginDto: LoginDto, context: SessionRequestContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });
    const passwordIsCorrect = await bcrypt.compare(
      loginDto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordIsCorrect) {
      const recentFailures = await this.recentLoginFailureCount(
        user?.id,
        context.ipAddress,
      );
      const suspicious = recentFailures >= 2;
      const auditId = await this.recordAuthAudit(
        user?.id,
        'LOGIN_FAILED',
        context,
        {
          reason: 'INVALID_CREDENTIALS',
          suspicious,
          failureCount: recentFailures + 1,
        },
      );

      if (user && suspicious) {
        await this.notifySecurityAlert(
          user,
          auditId,
          'Multiple failed sign-in attempts were detected for your account.',
        );
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    try {
      this.assertUserCanAuthenticate(user);
    } catch (error) {
      await this.recordAuthAudit(user.id, 'LOGIN_FAILED', context, {
        reason: 'ACCOUNT_NOT_ACTIVE',
        suspicious: true,
      });
      throw error;
    }

    if (this.requiresVerifiedEmail() && !user.emailVerifiedAt) {
      await this.issueOneTimeToken(
        user,
        OneTimeTokenPurpose.EMAIL_VERIFICATION,
      );
      await this.recordAuthAudit(user.id, 'LOGIN_FAILED', context, {
        reason: 'EMAIL_NOT_VERIFIED',
        suspicious: false,
      });
      throw new UnauthorizedException(
        'Email verification required. A new verification link has been sent.',
      );
    }

    const suspiciousLogin = await this.analyzeLogin(user.id, context);
    const authentication = await this.createAuthenticationResponse(
      user,
      context,
    );
    const auditId = await this.recordAuthAudit(
      user.id,
      'LOGIN_SUCCESS',
      context,
      suspiciousLogin,
    );

    if (suspiciousLogin.suspicious) {
      await this.notifySecurityAlert(
        user,
        auditId,
        suspiciousLogin.reason === 'RECENT_FAILED_ATTEMPTS'
          ? 'A successful sign-in followed several failed attempts.'
          : 'A sign-in from a new device or network was detected.',
      );
    }

    return authentication;
  }

  async refresh(
    refreshToken: string | undefined,
    context: SessionRequestContext = {},
  ) {
    const parsedToken = this.parseRefreshToken(refreshToken);

    if (!parsedToken) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const refreshResult = await this.prisma.$transaction(
      async (transaction) => {
        const session = await transaction.authSession.findUnique({
          where: { id: parsedToken.sessionId },
          include: { user: true },
        });

        if (
          !session ||
          session.revokedAt ||
          session.expiresAt.getTime() <= Date.now()
        ) {
          throw new UnauthorizedException(
            'Refresh token is invalid or expired',
          );
        }

        if (!this.securelyEqual(session.tokenHash, parsedToken.tokenHash)) {
          await transaction.authSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          // Return a sentinel so the revocation commits; throwing inside the
          // transaction would roll the security update back.
          return {
            refreshTokenReuse: true as const,
            userId: session.userId,
            sessionId: session.id,
          };
        }

        this.assertUserCanAuthenticate(session.user);

        if (this.requiresVerifiedEmail() && !session.user.emailVerifiedAt) {
          throw new UnauthorizedException('Email verification required');
        }

        const secret = this.generateOpaqueToken();
        const expiresAt = this.refreshExpiry();

        const rotated = await transaction.authSession.updateMany({
          where: {
            id: session.id,
            tokenHash: parsedToken.tokenHash,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            tokenHash: this.hashToken(secret),
            expiresAt,
            lastUsedAt: new Date(),
          },
        });

        if (rotated.count !== 1) {
          await transaction.authSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return {
            refreshTokenReuse: true as const,
            userId: session.userId,
            sessionId: session.id,
          };
        }

        return {
          accessToken: await this.createAccessToken(session.user, session.id),
          refreshToken: `${session.id}.${secret}`,
          refreshTokenExpiresAt: expiresAt,
          user: this.toPublicUser(session.user),
        };
      },
    );

    if ('refreshTokenReuse' in refreshResult) {
      const auditId = await this.recordAuthAudit(
        refreshResult.userId,
        'REFRESH_TOKEN_REUSE',
        context,
        {
          suspicious: true,
          reason: 'ROTATED_REFRESH_TOKEN_REUSED',
          sessionId: refreshResult.sessionId,
        },
      );
      const user = this.prisma.user?.findUnique
        ? await this.prisma.user.findUnique({
            where: { id: refreshResult.userId },
          })
        : null;
      if (user) {
        await this.notifySecurityAlert(
          user,
          auditId,
          'A previously rotated refresh token was reused. The affected session was revoked.',
        );
      }
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    return refreshResult;
  }

  async logout(
    refreshToken: string | undefined,
    context: SessionRequestContext = {},
  ): Promise<void> {
    const parsedToken = this.parseRefreshToken(refreshToken);

    if (!parsedToken) {
      return;
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: parsedToken.sessionId },
      select: { userId: true },
    });
    const revoked = await this.prisma.authSession.updateMany({
      where: {
        id: parsedToken.sessionId,
        tokenHash: parsedToken.tokenHash,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (session && revoked.count > 0) {
      await this.recordAuthAudit(session.userId, 'LOGOUT', context, {
        sessionId: parsedToken.sessionId,
      });
    }
  }

  async listSessions(userId: string, refreshToken?: string) {
    const currentSessionId = this.parseRefreshToken(refreshToken)?.sessionId;
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        createdByIp: true,
        userAgent: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return {
      items: sessions.map((session) => ({
        ...session,
        current: session.id === currentSessionId,
      })),
    };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    context: SessionRequestContext = {},
  ): Promise<void> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count > 0) {
      await this.recordAuthAudit(userId, 'SESSION_REVOKED', context, {
        sessionId,
      });
    }
  }

  async revokeOtherSessions(
    userId: string,
    refreshToken?: string,
    context: SessionRequestContext = {},
  ): Promise<void> {
    const currentSessionId = this.parseRefreshToken(refreshToken)?.sessionId;

    const result = await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    await this.recordAuthAudit(userId, 'SESSIONS_REVOKED', context, {
      count: result.count,
      currentSessionRetained: Boolean(currentSessionId),
    });
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    context: SessionRequestContext = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (user?.accountStatus === AccountStatus.ACTIVE) {
      await this.issueOneTimeToken(user, OneTimeTokenPurpose.PASSWORD_RESET);
      await this.recordAuthAudit(user.id, 'PASSWORD_RESET_REQUESTED', context);
    } else {
      await bcrypt.hash(dto.email, 4);
    }

    return { message: GENERIC_PASSWORD_RESET_RESPONSE };
  }

  async resetPassword(
    dto: ResetPasswordDto,
    context: SessionRequestContext = {},
  ) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const tokenHash = this.hashToken(dto.token);

    const resetUserId = await this.prisma.$transaction(async (transaction) => {
      const token = await transaction.oneTimeToken.findFirst({
        where: {
          tokenHash,
          purpose: OneTimeTokenPurpose.PASSWORD_RESET,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!token) {
        throw new BadRequestException('Reset token is invalid or expired');
      }

      const consumed = await transaction.oneTimeToken.updateMany({
        where: { id: token.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException('Reset token is invalid or expired');
      }

      await transaction.user.update({
        where: { id: token.userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await transaction.authSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.oneTimeToken.updateMany({
        where: {
          userId: token.userId,
          purpose: OneTimeTokenPurpose.PASSWORD_RESET,
          consumedAt: null,
        },
        data: { consumedAt: new Date() },
      });
      return token.userId;
    });

    await this.recordAuthAudit(resetUserId, 'PASSWORD_RESET', context, {
      sessionsRevoked: true,
    });

    return {
      message: 'Password reset completed. Sign in with your new password.',
    };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    context: SessionRequestContext = {},
  ) {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const currentPasswordIsCorrect = await bcrypt.compare(
      dto.currentPassword,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !currentPasswordIsCorrect) {
      await this.recordAuthAudit(userId, 'PASSWORD_CHANGE_FAILED', context, {
        reason: 'CURRENT_PASSWORD_INCORRECT',
        suspicious: false,
      });
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.oneTimeToken.updateMany({
        where: {
          userId,
          purpose: OneTimeTokenPurpose.PASSWORD_RESET,
          consumedAt: null,
        },
        data: { consumedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'PASSWORD_CHANGED',
          entity: 'User',
          entityId: userId,
          ipAddress: context.ipAddress?.slice(0, 128),
          userAgent: context.userAgent?.slice(0, 512),
          metadata: { sessionsRevoked: true },
        },
      });
    });

    return { message: 'Password changed. Sign in again on this device.' };
  }

  async listSecurityEvents(userId: string, limit: number) {
    const actions = [
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'LOGOUT',
      'SESSION_REVOKED',
      'SESSIONS_REVOKED',
      'REFRESH_TOKEN_REUSE',
      'PASSWORD_CHANGE_FAILED',
      'PASSWORD_CHANGED',
      'PASSWORD_RESET',
      'PASSWORD_RESET_REQUESTED',
      'EMAIL_VERIFIED',
    ];
    const items = await this.prisma.auditLog.findMany({
      where: { userId, action: { in: actions } },
      select: {
        id: true,
        action: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return { items };
  }

  async requestEmailVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (user && !user.emailVerifiedAt) {
      this.assertUserCanAuthenticate(user);
      await this.issueOneTimeToken(
        user,
        OneTimeTokenPurpose.EMAIL_VERIFICATION,
      );
    }

    return { message: GENERIC_VERIFICATION_RESPONSE };
  }

  async resendEmailVerification(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (user?.accountStatus === AccountStatus.ACTIVE && !user.emailVerifiedAt) {
      await this.issueOneTimeToken(
        user,
        OneTimeTokenPurpose.EMAIL_VERIFICATION,
      );
    } else {
      await bcrypt.hash(dto.email, 4);
    }

    return { message: GENERIC_VERIFICATION_RESPONSE };
  }

  async confirmEmailVerification(
    dto: VerifyEmailDto,
    context: SessionRequestContext = {},
  ) {
    const tokenHash = this.hashToken(dto.token);

    const verifiedUserId = await this.prisma.$transaction(
      async (transaction) => {
        const token = await transaction.oneTimeToken.findFirst({
          where: {
            tokenHash,
            purpose: OneTimeTokenPurpose.EMAIL_VERIFICATION,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
        });

        if (!token) {
          throw new BadRequestException(
            'Verification token is invalid or expired',
          );
        }

        const consumed = await transaction.oneTimeToken.updateMany({
          where: { id: token.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });

        if (consumed.count !== 1) {
          throw new BadRequestException(
            'Verification token is invalid or expired',
          );
        }

        await transaction.user.update({
          where: { id: token.userId },
          data: { emailVerifiedAt: new Date() },
        });
        await transaction.oneTimeToken.updateMany({
          where: {
            userId: token.userId,
            purpose: OneTimeTokenPurpose.EMAIL_VERIFICATION,
            consumedAt: null,
          },
          data: { consumedAt: new Date() },
        });
        return token.userId;
      },
    );

    await this.recordAuthAudit(verifiedUserId, 'EMAIL_VERIFIED', context);

    return { message: 'Email address verified.' };
  }

  private async createAuthenticationResponse(
    user: AuthenticationUser,
    context: SessionRequestContext,
  ) {
    if (!this.prisma.authSession?.create) {
      return {
        accessToken: await this.createAccessToken(user),
        user: this.toPublicUser(user),
      };
    }

    const secret = this.generateOpaqueToken();
    const expiresAt = this.refreshExpiry();
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(secret),
        expiresAt,
        createdByIp: context.ipAddress?.slice(0, 128),
        userAgent: context.userAgent?.slice(0, 512),
      },
    });

    return {
      accessToken: await this.createAccessToken(user, session.id),
      refreshToken: `${session.id}.${secret}`,
      refreshTokenExpiresAt: expiresAt,
      user: this.toPublicUser(user),
    };
  }

  private async createAccessToken(
    user: Pick<User, 'id' | 'email' | 'role'>,
    sessionId?: string,
  ): Promise<string> {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(sessionId ? { sid: sessionId } : {}),
    };

    return this.jwtService.signAsync(payload);
  }

  private async issueOneTimeToken(
    user: Pick<User, 'id' | 'email' | 'name'>,
    purpose: OneTimeTokenPurpose,
  ): Promise<void> {
    if (!this.prisma.oneTimeToken?.create) {
      return;
    }

    const rawToken = this.generateOpaqueToken();
    const now = new Date();
    const ttl =
      purpose === OneTimeTokenPurpose.PASSWORD_RESET
        ? this.numberConfig('PASSWORD_RESET_TTL_MINUTES', 30, 5, 1440) * 60_000
        : this.numberConfig('EMAIL_VERIFICATION_TTL_HOURS', 24, 1, 168) *
          3_600_000;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.oneTimeToken.updateMany({
        where: { userId: user.id, purpose, consumedAt: null },
        data: { consumedAt: now },
      });
      await transaction.oneTimeToken.create({
        data: {
          userId: user.id,
          purpose,
          tokenHash: this.hashToken(rawToken),
          expiresAt: new Date(now.getTime() + ttl),
        },
      });
    });

    if (!this.emailProvider) {
      return;
    }

    const publicUrl = (
      this.config?.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
    const isPasswordReset = purpose === OneTimeTokenPurpose.PASSWORD_RESET;
    const path = isPasswordReset ? 'reset-password' : 'verify-email';
    // Keep one-time credentials out of HTTP request targets, reverse-proxy
    // access logs, and Referer headers. The SPA reads and immediately removes
    // the fragment before it submits the token in a protected HTTPS body.
    const link = `${publicUrl}/${path}#token=${encodeURIComponent(rawToken)}`;
    const subject = isPasswordReset
      ? 'Reset your CareTrack password'
      : 'Verify your CareTrack email';
    const action = isPasswordReset
      ? 'reset your password'
      : 'verify your email';

    await this.emailProvider.send({
      recipients: [user.email],
      subject,
      text: `Hello ${user.name}, use this one-time link to ${action}: ${link}. If you did not request this, you can ignore this message.`,
      html: `<p>Hello ${this.escapeHtml(user.name)},</p><p>Use this one-time link to ${action}: <a href="${this.escapeHtml(link)}">${this.escapeHtml(link)}</a>.</p><p>If you did not request this, you can ignore this message.</p>`,
    });
  }

  private async analyzeLogin(
    userId: string,
    context: SessionRequestContext,
  ): Promise<{ suspicious: boolean; reason: string | null }> {
    const recentFailures = await this.recentLoginFailureCount(
      userId,
      context.ipAddress,
    );
    if (recentFailures >= 3) {
      return { suspicious: true, reason: 'RECENT_FAILED_ATTEMPTS' };
    }

    if (!this.prisma.authSession?.findFirst) {
      return { suspicious: false, reason: null };
    }

    const anyPreviousSession = await this.prisma.authSession.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!anyPreviousSession) {
      return { suspicious: false, reason: null };
    }

    const knownContext: Prisma.AuthSessionWhereInput[] = [];
    if (context.ipAddress) {
      knownContext.push({
        createdByIp: context.ipAddress.slice(0, 128),
      });
    }
    if (context.userAgent) {
      knownContext.push({ userAgent: context.userAgent.slice(0, 512) });
    }
    if (knownContext.length === 0) {
      return { suspicious: false, reason: null };
    }

    const recognizedSession = await this.prisma.authSession.findFirst({
      where: { userId, OR: knownContext },
      select: { id: true },
    });

    return recognizedSession
      ? { suspicious: false, reason: null }
      : { suspicious: true, reason: 'NEW_DEVICE_OR_NETWORK' };
  }

  private async recentLoginFailureCount(
    userId?: string,
    ipAddress?: string,
  ): Promise<number> {
    if (!this.prisma.auditLog?.count || (!userId && !ipAddress)) return 0;

    const identities: Prisma.AuditLogWhereInput[] = [];
    if (userId) identities.push({ userId });
    if (ipAddress) identities.push({ ipAddress: ipAddress.slice(0, 128) });

    return this.prisma.auditLog.count({
      where: {
        action: 'LOGIN_FAILED',
        createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
        OR: identities,
      },
    });
  }

  private async recordAuthAudit(
    userId: string | undefined,
    action: string,
    context: SessionRequestContext = {},
    metadata: Record<string, string | number | boolean | null | undefined> = {},
  ): Promise<string | undefined> {
    if (!this.prisma.auditLog?.create) return undefined;

    const safeMetadata = Object.fromEntries(
      Object.entries(metadata).filter((entry) => entry[1] !== undefined),
    ) as Prisma.InputJsonObject;
    const record = await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entity: 'User',
        entityId: userId,
        ipAddress: context.ipAddress?.slice(0, 128),
        userAgent: context.userAgent?.slice(0, 512),
        metadata:
          Object.keys(safeMetadata).length > 0 ? safeMetadata : undefined,
      },
      select: { id: true },
    });
    return record.id;
  }

  private async notifySecurityAlert(
    user: Pick<User, 'id' | 'email' | 'name'>,
    auditId: string | undefined,
    message: string,
  ): Promise<void> {
    if (!this.prisma.notification?.upsert) return;

    const preferences = this.prisma.notificationPreference?.findUnique
      ? await this.prisma.notificationPreference.findUnique({
          where: { userId: user.id },
        })
      : null;
    if (preferences && !preferences.securityAlerts) return;

    const deduplicationKey = `security:${auditId ?? this.generateOpaqueToken()}`;
    const notification = await this.prisma.notification.upsert({
      where: { deduplicationKey },
      update: {},
      create: {
        userId: user.id,
        type: NotificationType.SECURITY_ALERT,
        title: 'Account security alert',
        message,
        deduplicationKey,
      },
    });

    if (this.prisma.notificationDelivery?.upsert) {
      await this.prisma.notificationDelivery.upsert({
        where: {
          notificationId_channel: {
            notificationId: notification.id,
            channel: NotificationChannelType.IN_APP,
          },
        },
        update: {},
        create: {
          notificationId: notification.id,
          channel: NotificationChannelType.IN_APP,
          status:
            preferences?.inAppEnabled === false
              ? NotificationDeliveryStatus.SKIPPED
              : NotificationDeliveryStatus.SENT,
          attempts: preferences?.inAppEnabled === false ? 0 : 1,
          lastAttemptAt: new Date(),
          sentAt: preferences?.inAppEnabled === false ? null : new Date(),
        },
      });
    }

    if (preferences?.emailEnabled === false || !this.emailProvider) return;

    const result = await this.emailProvider.send({
      recipients: [user.email],
      subject: 'CareTrack account security alert',
      text: `Hello ${user.name}, ${message} Review active sessions in CareTrack and change your password if you do not recognize this activity.`,
    });
    if (this.prisma.notificationDelivery?.upsert) {
      await this.prisma.notificationDelivery.upsert({
        where: {
          notificationId_channel: {
            notificationId: notification.id,
            channel: NotificationChannelType.EMAIL,
          },
        },
        update: {},
        create: {
          notificationId: notification.id,
          channel: NotificationChannelType.EMAIL,
          status:
            result.outcome === 'DELIVERED'
              ? NotificationDeliveryStatus.SENT
              : result.outcome === 'FAILED'
                ? NotificationDeliveryStatus.FAILED
                : NotificationDeliveryStatus.SKIPPED,
          attempts: 1,
          lastAttemptAt: new Date(),
          sentAt: result.outcome === 'DELIVERED' ? new Date() : null,
          providerMessageId: result.providerMessageId,
          errorCode: result.errorCode,
        },
      });
    }
  }

  private assertUserCanAuthenticate(user: Pick<User, 'accountStatus'>): void {
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }
  }

  private requiresVerifiedEmail(): boolean {
    return this.config?.get<string>('AUTH_REQUIRE_VERIFIED_EMAIL') === 'true';
  }

  private refreshExpiry(): Date {
    const days = this.numberConfig('REFRESH_TOKEN_TTL_DAYS', 30, 1, 365);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private numberConfig(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(this.config?.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(maximum, Math.max(minimum, value))
      : fallback;
  }

  private parseRefreshToken(
    token: string | undefined,
  ): { sessionId: string; tokenHash: string } | undefined {
    if (!token || token.length > 512) {
      return undefined;
    }

    const separatorIndex = token.indexOf('.');
    const sessionId = token.slice(0, separatorIndex);
    const secret = token.slice(separatorIndex + 1);

    if (
      separatorIndex <= 0 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        sessionId,
      ) ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(secret)
    ) {
      return undefined;
    }

    return { sessionId, tokenHash: this.hashToken(secret) };
  }

  private generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private securelyEqual(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(actual, 'utf8');

    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private toPublicUser(user: AuthenticationUser) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      emailVerified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt,
    };
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const escaped: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return escaped[character];
    });
  }
}
