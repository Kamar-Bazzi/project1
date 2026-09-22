import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { DocumentsModule } from '../documents/documents.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [ConfigModule, AuthModule, HealthAuditModule, DocumentsModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
