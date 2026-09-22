import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DataRetentionModule } from '../data-retention/data-retention.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, DataRetentionModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
