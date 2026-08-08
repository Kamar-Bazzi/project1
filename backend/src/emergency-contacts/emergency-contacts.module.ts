import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { EmergencyContactsController } from './emergency-contacts.controller';
import { EmergencyContactsService } from './emergency-contacts.service';

@Module({
  imports: [AuthModule, HealthAuditModule],
  controllers: [EmergencyContactsController],
  providers: [EmergencyContactsService],
})
export class EmergencyContactsModule {}
