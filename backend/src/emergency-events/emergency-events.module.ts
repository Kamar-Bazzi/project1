import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmergencyEventsController } from './emergency-events.controller';
import { EmergencyEventsService } from './emergency-events.service';

@Module({
  imports: [
    AuthModule,
    ClinicalAccessModule,
    HealthAuditModule,
    NotificationsModule,
  ],
  controllers: [EmergencyEventsController],
  providers: [EmergencyEventsService],
  exports: [EmergencyEventsService],
})
export class EmergencyEventsModule {}
