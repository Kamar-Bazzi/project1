import { Controller, Get } from '@nestjs/common';
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
  async checkDatabase() {
    const usersCount = await this.prisma.user.count();

    return {
      success: true,
      message: 'PostgreSQL connection successful',
      usersCount,
    };
  }
}