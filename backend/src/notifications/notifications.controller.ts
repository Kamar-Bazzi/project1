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
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationsService } from './notifications.service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT, UserRole.DOCTOR, UserRole.ADMIN)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notifications.findForUser(
      request.user.id,
      query.unreadOnly,
      query.limit,
    );
  }

  @Patch('read-all')
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(request.user.id);
  }

  @Get('preferences')
  getPreferences(@Req() request: AuthenticatedRequest) {
    return this.notifications.getPreferences(request.user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(request.user.id, dto);
  }

  @Patch(':notificationId/read')
  markRead(
    @Req() request: AuthenticatedRequest,
    @Param('notificationId', new ParseUUIDPipe({ version: '4' }))
    notificationId: string,
  ) {
    return this.notifications.markRead(request.user.id, notificationId);
  }

  @Patch(':notificationId/unread')
  markUnread(
    @Req() request: AuthenticatedRequest,
    @Param('notificationId', new ParseUUIDPipe({ version: '4' }))
    notificationId: string,
  ) {
    return this.notifications.markUnread(request.user.id, notificationId);
  }

  @Get('push-public-key')
  getPushPublicKey() {
    return {
      publicKey: this.config.get<string>('WEB_PUSH_PUBLIC_KEY') ?? null,
    };
  }

  @Post('push-subscriptions')
  savePushSubscription(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePushSubscriptionDto,
  ) {
    return this.notifications.savePushSubscription(request.user.id, {
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      expirationTime: dto.expirationTime,
    });
  }

  @Delete('push-subscriptions/:subscriptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePushSubscription(
    @Req() request: AuthenticatedRequest,
    @Param('subscriptionId', new ParseUUIDPipe({ version: '4' }))
    subscriptionId: string,
  ) {
    return this.notifications.removePushSubscription(
      request.user.id,
      subscriptionId,
    );
  }
}
