import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { Roles } from './auth/decorators/roles.decorator';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHome() {
    return {
      message: 'Medical Tracking API is running',
    };
  }

  @Get('database-check')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async checkDatabase() {
    const usersCount = await this.prisma.user.count();

    return {
      success: true,
      message: 'PostgreSQL connection successful',
      usersCount,
    };
  }
}
