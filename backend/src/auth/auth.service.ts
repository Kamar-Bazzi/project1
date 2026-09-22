import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
  TwoFactorChallengePurpose,
  TwoFactorMethod,
  User,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { isIP } from 'node:net';

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
import {
  ConfirmAuthenticatorSetupDto,
  DisableTwoFactorDto,
  TwoFactorPasswordDto,
  VerifyTwoFactorLoginDto,
} from './dto/two-factor.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  decryptAuthenticatorSecret,
  encryptAuthenticatorSecret,
  generateAuthenticatorSecret,
  verifyTotp,
} from './two-factor-crypto';

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

interface LoginRiskAnalysis {
  suspicious: boolean;
  reason: string | null;
  riskScore: number;
  signals: string[];
}

interface LoginSessionContext {
  deviceFingerprint: string | null;
  networkFingerprint: string | null;
  userAgent: string | null;
  createdByIp: string | null;
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
  private readonly logger = new Logger(AuthService.name);

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
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });
    const passwordIsCorrect = await bcrypt.compare(
      loginDto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordIsCorrect) {
      if (user && this.isLoginLocked(user, now)) {
        await this.recordAuthAudit(user.id, 'LOGIN_FAILED', context, {
          reason: 'ACCOUNT_TEMPORARILY_LOCKED',
          suspicious: false,
          lockedUntil: user.lockedUntil?.toISOString(),
        });
        throw new UnauthorizedException(INVALID_CREDENTIALS);
      }

      const recentFailures =
        (await this.recentLoginFailureCount(user?.id, context.ipAddress)) + 1;
      const lock = user
        ? await this.registerFailedLogin(user, now)
        : { accountFailureCount: 0, newlyLocked: false, lockedUntil: null };
      const warningThreshold = this.loginWarningThreshold();
      const suspicious = recentFailures >= warningThreshold;
      await this.recordAuthAudit(user?.id, 'LOGIN_FAILED', context, {
        reason: 'INVALID_CREDENTIALS',
        suspicious,
        failureCount: recentFailures,
        accountFailureCount: lock.accountFailureCount,
        locked: lock.newlyLocked,
        lockedUntil: lock.lockedUntil?.toISOString(),
      });

      const unusualThresholdCrossed =
        recentFailures === warningThreshold || lock.newlyLocked;
      let unusualAuditId: string | undefined;
      if (suspicious && unusualThresholdCrossed) {
        unusualAuditId = await this.recordAuthAudit(
          user?.id,
          'UNUSUAL_LOGIN_ATTEMPT',
          context,
          {
            outcome: 'FAILED',
            reason: 'REPEATED_FAILED_ATTEMPTS',
            riskScore: lock.newlyLocked ? 3 : 2,
            failureCount: recentFailures,
          },
        );
      }

      let lockAuditId: string | undefined;
      if (user && lock.newlyLocked) {
        lockAuditId = await this.recordAuthAudit(
          user.id,
          'ACCOUNT_TEMPORARILY_LOCKED',
          context,
          {
            reason: 'REPEATED_FAILED_ATTEMPTS',
            failureCount: lock.accountFailureCount,
            lockedUntil: lock.lockedUntil?.toISOString(),
          },
        );
      }

      if (user && unusualThresholdCrossed) {
        await this.notifySecurityAlertSafely(
          user,
          lockAuditId ?? unusualAuditId,
          lock.newlyLocked
            ? `Your account was temporarily locked after repeated unsuccessful sign-in attempts. The lock expires at ${lock.lockedUntil?.toISOString()}. You can also reset your password.`
            : 'Multiple unsuccessful sign-in attempts were detected for your account.',
        );
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (this.isLoginLocked(user, now)) {
      await this.recordAuthAudit(user.id, 'LOGIN_FAILED', context, {
        reason: 'ACCOUNT_TEMPORARILY_LOCKED',
        suspicious: false,
        lockedUntil: user.lockedUntil?.toISOString(),
      });
      const remainingMinutes = Math.max(
        1,
        Math.ceil((user.lockedUntil!.getTime() - now.getTime()) / 60_000),
      );
      throw new UnauthorizedException(
        `Account is temporarily locked. Try again in ${remainingMinutes} minute(s) or reset your password.`,
      );
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

    if (this.requiresTwoFactorChallenge(user)) {
      await this.clearFailedLoginState(user.id);
      const challenge = await this.issueTwoFactorLoginChallenge(user);
      await this.recordAuthAudit(
        user.id,
        'TWO_FACTOR_CHALLENGE_ISSUED',
        context,
        { method: challenge.method },
      );
      return {
        ...challenge,
        requiresTwoFactor: true as const,
        user: this.toPublicUser(user),
      };
    }

    const suspiciousLogin = await this.analyzeLogin(user.id, context);
    const authentication = await this.createAuthenticationResponse(
      user,
      context,
    );
    await this.clearFailedLoginState(user.id);
    await this.recordAuthAudit(user.id, 'LOGIN_SUCCESS', context, {
      ...suspiciousLogin,
    });

    if (suspiciousLogin.suspicious) {
      const unusualAuditId = await this.recordAuthAudit(
        user.id,
        'UNUSUAL_LOGIN_ATTEMPT',
        context,
        {
          ...suspiciousLogin,
          outcome: 'SUCCESS',
        },
      );
      await this.notifySecurityAlertSafely(
        user,
        unusualAuditId,
        this.loginRiskMessage(suspiciousLogin.reason),
      );
    }

    return authentication;
  }

  async verifyTwoFactorLogin(
    dto: VerifyTwoFactorLoginDto,
    context: SessionRequestContext = {},
  ) {
    const challenge = await this.prisma.twoFactorChallenge.findUnique({
      where: { id: dto.challengeId },
      include: { user: true },
    });
    const now = new Date();

    if (
      !challenge ||
      challenge.purpose !== TwoFactorChallengePurpose.LOGIN ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= challenge.maxAttempts
    ) {
      throw new UnauthorizedException(
        'Two-factor challenge is invalid or expired',
      );
    }

    this.assertUserCanAuthenticate(challenge.user);
    this.assertTwoFactorRole(challenge.user.role);
    const valid = this.verifyTwoFactorCode(
      challenge.method,
      dto.code,
      challenge.id,
      challenge.codeHash,
      challenge.user.twoFactorSecretEncrypted,
    );

    if (!valid) {
      const nextAttempts = challenge.attempts + 1;
      await this.prisma.twoFactorChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: {
          attempts: { increment: 1 },
          consumedAt: nextAttempts >= challenge.maxAttempts ? now : undefined,
        },
      });
      await this.recordAuthAudit(
        challenge.userId,
        'TWO_FACTOR_CHALLENGE_FAILED',
        context,
        {
          method: challenge.method,
          attempts: nextAttempts,
          locked: nextAttempts >= challenge.maxAttempts,
        },
      );
      throw new UnauthorizedException('Verification code is invalid');
    }

    const consumed = await this.prisma.twoFactorChallenge.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: challenge.attempts,
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException(
        'Two-factor challenge is invalid or expired',
      );
    }

    const suspiciousLogin = await this.analyzeLogin(challenge.userId, context);
    const authentication = await this.createAuthenticationResponse(
      challenge.user,
      context,
    );
    await this.clearFailedLoginState(challenge.userId);
    await this.recordAuthAudit(
      challenge.userId,
      'TWO_FACTOR_CHALLENGE_COMPLETED',
      context,
      { method: challenge.method },
    );
    await this.recordAuthAudit(challenge.userId, 'LOGIN_SUCCESS', context, {
      ...suspiciousLogin,
      twoFactorMethod: challenge.method,
    });
    if (suspiciousLogin.suspicious) {
      const unusualAuditId = await this.recordAuthAudit(
        challenge.userId,
        'UNUSUAL_LOGIN_ATTEMPT',
        context,
        {
          ...suspiciousLogin,
          outcome: 'SUCCESS',
          twoFactorMethod: challenge.method,
        },
      );
      await this.notifySecurityAlertSafely(
        challenge.user,
        unusualAuditId,
        this.loginRiskMessage(suspiciousLogin.reason),
      );
    }

    return authentication;
  }

  async getTwoFactorStatus(userId: string) {
    const user = await this.requireTwoFactorUser(userId);
    return {
      requiredForRole: true,
      enabled: Boolean(user.twoFactorEnabledAt && user.twoFactorMethod),
      method: user.twoFactorMethod,
      enabledAt: user.twoFactorEnabledAt,
      availableMethods: [
        TwoFactorMethod.EMAIL_OTP,
        TwoFactorMethod.AUTHENTICATOR,
      ],
    };
  }

  async enableEmailTwoFactor(
    userId: string,
    dto: TwoFactorPasswordDto,
    context: SessionRequestContext = {},
  ) {
    const user = await this.requireTwoFactorUser(userId);
    await this.assertCurrentPassword(user, dto.currentPassword);
    if (!this.emailProvider?.configured) {
      throw new BadRequestException(
        'Email OTP is unavailable until outbound email is configured',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: {
          twoFactorMethod: TwoFactorMethod.EMAIL_OTP,
          twoFactorSecretEncrypted: null,
          twoFactorEnabledAt: new Date(),
        },
      });
      await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.twoFactorChallenge.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
    });
    await this.recordAuthAudit(userId, 'TWO_FACTOR_ENABLED', context, {
      method: TwoFactorMethod.EMAIL_OTP,
      sessionsRevoked: true,
    });

    return {
      message: 'Email two-factor authentication enabled. Sign in again.',
    };
  }

  async beginAuthenticatorSetup(
    userId: string,
    dto: TwoFactorPasswordDto,
    context: SessionRequestContext = {},
  ) {
    const user = await this.requireTwoFactorUser(userId);
    await this.assertCurrentPassword(user, dto.currentPassword);
    const secret = generateAuthenticatorSecret();
    const encrypted = encryptAuthenticatorSecret(
      secret,
      this.twoFactorEncryptionMaterial(),
    );
    const expiresAt = new Date(Date.now() + 10 * 60_000);

    await this.prisma.twoFactorChallenge.updateMany({
      where: {
        userId,
        purpose: TwoFactorChallengePurpose.AUTHENTICATOR_SETUP,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    const challenge = await this.prisma.twoFactorChallenge.create({
      data: {
        userId,
        purpose: TwoFactorChallengePurpose.AUTHENTICATOR_SETUP,
        method: TwoFactorMethod.AUTHENTICATOR,
        pendingSecretEncrypted: encrypted,
        expiresAt,
      },
    });
    await this.recordAuthAudit(
      userId,
      'TWO_FACTOR_AUTHENTICATOR_SETUP_STARTED',
      context,
    );
    const issuer = encodeURIComponent('CareTrack');
    const account = encodeURIComponent(user.email);

    return {
      challengeId: challenge.id,
      secret,
      otpauthUrl: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
      expiresAt,
    };
  }

  async confirmAuthenticatorSetup(
    userId: string,
    dto: ConfirmAuthenticatorSetupDto,
    context: SessionRequestContext = {},
  ) {
    const user = await this.requireTwoFactorUser(userId);
    const challenge = await this.prisma.twoFactorChallenge.findFirst({
      where: {
        id: dto.challengeId,
        userId,
        purpose: TwoFactorChallengePurpose.AUTHENTICATOR_SETUP,
        method: TwoFactorMethod.AUTHENTICATOR,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge?.pendingSecretEncrypted) {
      throw new BadRequestException(
        'Authenticator setup is invalid or expired',
      );
    }

    const secret = decryptAuthenticatorSecret(
      challenge.pendingSecretEncrypted,
      this.twoFactorEncryptionMaterial(),
    );
    if (!verifyTotp(secret, dto.code)) {
      await this.prisma.twoFactorChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Authenticator code is invalid');
    }

    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.twoFactorChallenge.updateMany({
        where: {
          id: challenge.id,
          userId,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(
          'Authenticator setup is invalid or expired',
        );
      }
      await transaction.user.update({
        where: { id: user.id },
        data: {
          twoFactorMethod: TwoFactorMethod.AUTHENTICATOR,
          twoFactorSecretEncrypted: challenge.pendingSecretEncrypted,
          twoFactorEnabledAt: now,
        },
      });
      await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    await this.recordAuthAudit(userId, 'TWO_FACTOR_ENABLED', context, {
      method: TwoFactorMethod.AUTHENTICATOR,
      sessionsRevoked: true,
    });

    return {
      message:
        'Authenticator two-factor authentication enabled. Sign in again.',
    };
  }

  async disableTwoFactor(
    userId: string,
    dto: DisableTwoFactorDto,
    context: SessionRequestContext = {},
  ) {
    const user = await this.requireTwoFactorUser(userId);
    await this.assertCurrentPassword(user, dto.currentPassword);
    if (!user.twoFactorMethod || !user.twoFactorEnabledAt) {
      return { message: 'Two-factor authentication is already disabled.' };
    }
    if (
      user.twoFactorMethod === TwoFactorMethod.AUTHENTICATOR &&
      (!dto.code ||
        !user.twoFactorSecretEncrypted ||
        !verifyTotp(
          decryptAuthenticatorSecret(
            user.twoFactorSecretEncrypted,
            this.twoFactorEncryptionMaterial(),
          ),
          dto.code,
        ))
    ) {
      throw new UnauthorizedException('Authenticator code is invalid');
    }

    const priorMethod = user.twoFactorMethod;
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: {
          twoFactorMethod: null,
          twoFactorSecretEncrypted: null,
          twoFactorEnabledAt: null,
        },
      });
      await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.twoFactorChallenge.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
    });
    await this.recordAuthAudit(userId, 'TWO_FACTOR_DISABLED', context, {
      method: priorMethod,
      sessionsRevoked: true,
    });

    return { message: 'Two-factor authentication disabled. Sign in again.' };
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
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
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
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
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
      'ACCOUNT_REGISTERED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'UNUSUAL_LOGIN_ATTEMPT',
      'ACCOUNT_TEMPORARILY_LOCKED',
      'ACCOUNT_UNLOCKED',
      'RATE_LIMIT_EXCEEDED',
      'LOGOUT',
      'SESSION_REVOKED',
      'SESSIONS_REVOKED',
      'REFRESH_TOKEN_REUSE',
      'PASSWORD_CHANGE_FAILED',
      'PASSWORD_CHANGED',
      'PASSWORD_RESET',
      'PASSWORD_RESET_REQUESTED',
      'EMAIL_VERIFIED',
      'TWO_FACTOR_CHALLENGE_ISSUED',
      'TWO_FACTOR_CHALLENGE_FAILED',
      'TWO_FACTOR_CHALLENGE_COMPLETED',
      'TWO_FACTOR_AUTHENTICATOR_SETUP_STARTED',
      'TWO_FACTOR_ENABLED',
      'TWO_FACTOR_DISABLED',
      'NOTIFICATION_PREFERENCES_UPDATED',
      'PATIENT_CONSENT_UPDATED',
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
        deviceFingerprint: this.deviceFingerprint(context.userAgent),
        networkFingerprint: this.networkFingerprint(context.ipAddress),
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

  private requiresTwoFactorChallenge(
    user: Pick<User, 'role' | 'twoFactorEnabledAt' | 'twoFactorMethod'>,
  ): boolean {
    return (
      (user.role === UserRole.DOCTOR || user.role === UserRole.ADMIN) &&
      Boolean(user.twoFactorEnabledAt && user.twoFactorMethod)
    );
  }

  private async issueTwoFactorLoginChallenge(
    user: Pick<
      User,
      'id' | 'name' | 'email' | 'twoFactorMethod' | 'twoFactorEnabledAt'
    >,
  ) {
    if (!user.twoFactorMethod || !user.twoFactorEnabledAt) {
      throw new UnauthorizedException(
        'Two-factor authentication is not set up',
      );
    }
    if (
      user.twoFactorMethod === TwoFactorMethod.EMAIL_OTP &&
      !this.emailProvider?.configured
    ) {
      throw new BadRequestException(
        'Email OTP delivery is temporarily unavailable',
      );
    }

    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.prisma.twoFactorChallenge.updateMany({
      where: {
        userId: user.id,
        purpose: TwoFactorChallengePurpose.LOGIN,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
    await this.prisma.twoFactorChallenge.create({
      data: {
        id,
        userId: user.id,
        purpose: TwoFactorChallengePurpose.LOGIN,
        method: user.twoFactorMethod,
        codeHash:
          user.twoFactorMethod === TwoFactorMethod.EMAIL_OTP
            ? this.hashToken(`${id}:${code}`)
            : null,
        expiresAt,
      },
    });

    if (user.twoFactorMethod === TwoFactorMethod.EMAIL_OTP) {
      const result = await this.emailProvider!.send({
        recipients: [user.email],
        subject: 'Your CareTrack verification code',
        text: `Hello ${user.name}, your CareTrack sign-in code is ${code}. It expires in 10 minutes. If you did not try to sign in, change your password.`,
      });
      if (result.outcome !== 'DELIVERED') {
        await this.prisma.twoFactorChallenge.update({
          where: { id },
          data: { consumedAt: new Date() },
        });
        throw new BadRequestException(
          'Email OTP delivery is temporarily unavailable',
        );
      }
    }

    return {
      challengeId: id,
      method: user.twoFactorMethod,
      expiresAt,
    };
  }

  private verifyTwoFactorCode(
    method: TwoFactorMethod,
    candidate: string,
    challengeId: string,
    expectedCodeHash: string | null,
    encryptedAuthenticatorSecret: string | null,
  ): boolean {
    if (method === TwoFactorMethod.EMAIL_OTP) {
      return Boolean(
        expectedCodeHash &&
        this.securelyEqual(
          expectedCodeHash,
          this.hashToken(`${challengeId}:${candidate}`),
        ),
      );
    }

    if (!encryptedAuthenticatorSecret) return false;
    try {
      return verifyTotp(
        decryptAuthenticatorSecret(
          encryptedAuthenticatorSecret,
          this.twoFactorEncryptionMaterial(),
        ),
        candidate,
      );
    } catch {
      return false;
    }
  }

  private async requireTwoFactorUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    this.assertUserCanAuthenticate(user);
    this.assertTwoFactorRole(user.role);
    return user;
  }

  private assertTwoFactorRole(role: UserRole): void {
    if (role !== UserRole.DOCTOR && role !== UserRole.ADMIN) {
      throw new BadRequestException(
        'Two-factor authentication is available for doctor and admin accounts',
      );
    }
  }

  private async assertCurrentPassword(
    user: Pick<User, 'passwordHash'>,
    currentPassword: string,
  ): Promise<void> {
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
  }

  private twoFactorEncryptionMaterial(): string {
    const material =
      this.config?.get<string>('TWO_FACTOR_ENCRYPTION_KEY') ??
      this.config?.get<string>('JWT_SECRET');
    if (!material || material.length < 32) {
      throw new BadRequestException(
        'Two-factor encryption is not configured securely',
      );
    }
    return material;
  }

  private async analyzeLogin(
    userId: string,
    context: SessionRequestContext,
  ): Promise<LoginRiskAnalysis> {
    const recentFailures = await this.recentLoginFailureCount(
      userId,
      context.ipAddress,
    );
    const signals: string[] = [];
    let riskScore = 0;
    if (recentFailures >= this.loginWarningThreshold()) {
      signals.push('RECENT_FAILED_ATTEMPTS');
      riskScore += 2;
    }

    if (!this.prisma.authSession?.findFirst) {
      return this.loginRiskResult(signals, riskScore);
    }

    const anyPreviousSession = await this.prisma.authSession.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!anyPreviousSession) {
      // The first successful sign-in establishes a baseline and is not
      // labelled abnormal merely because there is no history yet.
      return this.loginRiskResult(signals, riskScore);
    }

    const deviceFingerprint = this.deviceFingerprint(context.userAgent);
    const networkFingerprint = this.networkFingerprint(context.ipAddress);
    const deviceCandidates: Prisma.AuthSessionWhereInput[] = [];
    const networkCandidates: Prisma.AuthSessionWhereInput[] = [];
    if (deviceFingerprint) deviceCandidates.push({ deviceFingerprint });
    if (context.userAgent) {
      deviceCandidates.push({ userAgent: context.userAgent.slice(0, 512) });
    }
    if (networkFingerprint) networkCandidates.push({ networkFingerprint });
    if (context.ipAddress) {
      networkCandidates.push({ createdByIp: context.ipAddress.slice(0, 128) });
    }

    const [recognizedDevice, recognizedNetwork, recentSessions] =
      await Promise.all([
        deviceCandidates.length > 0
          ? this.prisma.authSession.findFirst({
              where: { userId, OR: deviceCandidates },
              select: { id: true },
            })
          : Promise.resolve({ id: 'context-unavailable' }),
        networkCandidates.length > 0
          ? this.prisma.authSession.findFirst({
              where: { userId, OR: networkCandidates },
              select: { id: true },
            })
          : Promise.resolve({ id: 'context-unavailable' }),
        deviceFingerprint && networkFingerprint
          ? this.prisma.authSession.findMany({
              where: {
                userId,
                createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
              },
              select: {
                deviceFingerprint: true,
                networkFingerprint: true,
                userAgent: true,
                createdByIp: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
            })
          : Promise.resolve<LoginSessionContext[]>([]),
      ]);

    if (!recognizedDevice && deviceFingerprint) {
      signals.push('NEW_DEVICE');
      riskScore += 1;
    }
    if (!recognizedNetwork && networkFingerprint) {
      signals.push('NEW_NETWORK');
      riskScore += 1;
    }

    const rapidContextChange = recentSessions.some((session) => {
      const priorDevice =
        session.deviceFingerprint ?? this.deviceFingerprint(session.userAgent);
      const priorNetwork =
        session.networkFingerprint ??
        this.networkFingerprint(session.createdByIp);
      return (
        priorDevice !== undefined &&
        priorNetwork !== undefined &&
        priorDevice !== deviceFingerprint &&
        priorNetwork !== networkFingerprint
      );
    });
    if (rapidContextChange) {
      signals.push('RAPID_CONTEXT_CHANGE');
      riskScore += 2;
    }

    return this.loginRiskResult(signals, riskScore);
  }

  private loginRiskResult(
    signals: string[],
    riskScore: number,
  ): LoginRiskAnalysis {
    const suspicious = riskScore >= 2;
    const reason = !suspicious
      ? null
      : signals.includes('RECENT_FAILED_ATTEMPTS')
        ? 'RECENT_FAILED_ATTEMPTS'
        : signals.includes('RAPID_CONTEXT_CHANGE')
          ? 'RAPID_CONTEXT_CHANGE'
          : 'NEW_DEVICE_AND_NETWORK';

    return { suspicious, reason, riskScore, signals };
  }

  private async registerFailedLogin(
    user: Pick<
      User,
      'id' | 'failedLoginAttempts' | 'lastFailedLoginAt' | 'lockedUntil'
    >,
    now: Date,
  ) {
    const windowStartedAt = new Date(
      now.getTime() - this.loginFailureWindowMinutes() * 60_000,
    );
    const isContinuingSequence = Boolean(
      user.lastFailedLoginAt && user.lastFailedLoginAt >= windowStartedAt,
    );
    const accountFailureCount = isContinuingSequence
      ? user.failedLoginAttempts + 1
      : 1;
    const alreadyLocked = this.isLoginLocked(user, now);
    const newlyLocked =
      !alreadyLocked && accountFailureCount >= this.loginLockThreshold();
    const lockedUntil = alreadyLocked
      ? user.lockedUntil
      : newlyLocked
        ? new Date(now.getTime() + this.loginLockMinutes() * 60_000)
        : null;

    await this.prisma.user.updateMany({
      where: { id: user.id },
      data: {
        failedLoginAttempts: accountFailureCount,
        lastFailedLoginAt: now,
        lockedUntil,
      },
    });

    return { accountFailureCount, newlyLocked, lockedUntil };
  }

  private async clearFailedLoginState(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [
          { failedLoginAttempts: { gt: 0 } },
          { lastFailedLoginAt: { not: null } },
          { lockedUntil: { not: null } },
        ],
      },
      data: {
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
      },
    });
  }

  private isLoginLocked(
    user: Pick<User, 'lockedUntil'>,
    now = new Date(),
  ): boolean {
    return Boolean(user.lockedUntil && user.lockedUntil > now);
  }

  private loginRiskMessage(reason: string | null): string {
    if (reason === 'RECENT_FAILED_ATTEMPTS') {
      return 'A successful sign-in followed several unsuccessful attempts.';
    }
    if (reason === 'RAPID_CONTEXT_CHANGE') {
      return 'Sign-ins from different devices and networks occurred close together.';
    }
    return 'A sign-in from both a new device and a new network was detected.';
  }

  private deviceFingerprint(userAgent: string | null | undefined) {
    if (!userAgent?.trim()) return undefined;
    const normalized = userAgent.trim().toLowerCase().replace(/\s+/g, ' ');
    return this.hashToken(`device:${normalized}`);
  }

  private networkFingerprint(ipAddress: string | null | undefined) {
    const identity = this.networkIdentity(ipAddress);
    return identity ? this.hashToken(`network:${identity}`) : undefined;
  }

  private networkIdentity(ipAddress: string | null | undefined) {
    if (!ipAddress?.trim()) return undefined;
    let address = ipAddress.trim().toLowerCase().split('%', 1)[0];
    if (address.startsWith('::ffff:')) address = address.slice(7);

    if (isIP(address) === 4) {
      const octets = address.split('.');
      return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }
    if (isIP(address) !== 6) return undefined;

    const [left = '', right = ''] = address.split('::');
    const leftGroups = left ? left.split(':') : [];
    const rightGroups = right ? right.split(':') : [];
    const missingGroups = Math.max(
      0,
      8 - leftGroups.length - rightGroups.length,
    );
    const expanded = [
      ...leftGroups,
      ...Array.from({ length: missingGroups }, () => '0'),
      ...rightGroups,
    ].map((group) => Number.parseInt(group || '0', 16).toString(16));
    return `${expanded.slice(0, 4).join(':')}::/64`;
  }

  private loginFailureWindowMinutes(): number {
    return this.numberConfig('LOGIN_FAILURE_WINDOW_MINUTES', 15, 5, 120);
  }

  private loginWarningThreshold(): number {
    return this.numberConfig('LOGIN_WARNING_THRESHOLD', 3, 2, 20);
  }

  private loginLockThreshold(): number {
    return this.numberConfig('LOGIN_LOCK_THRESHOLD', 10, 5, 50);
  }

  private loginLockMinutes(): number {
    return this.numberConfig('LOGIN_LOCK_MINUTES', 15, 5, 1440);
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
        createdAt: {
          gte: new Date(Date.now() - this.loginFailureWindowMinutes() * 60_000),
        },
        OR: identities,
      },
    });
  }

  private async recordAuthAudit(
    userId: string | undefined,
    action: string,
    context: SessionRequestContext = {},
    metadata: Record<string, Prisma.InputJsonValue | null | undefined> = {},
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

  private async notifySecurityAlertSafely(
    user: Pick<User, 'id' | 'email' | 'name'>,
    auditId: string | undefined,
    message: string,
  ): Promise<void> {
    try {
      await this.notifySecurityAlert(user, auditId, message);
    } catch (error) {
      // Alert delivery must never turn a valid login into a failed login.
      const code =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      this.logger.warn(`Could not deliver login security alert (${code})`);
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
