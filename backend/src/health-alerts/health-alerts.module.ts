import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { HealthAlertEvaluatorService } from './health-alert-evaluator.service';
import { HealthAlertsController } from './health-alerts.controller';
import { HealthAlertsService } from './health-alerts.service';

@Module({
  imports: [AuthModule, HealthAuditModule, NotificationsModule],
  controllers: [HealthAlertsController, AlertRulesController],
  providers: [
    HealthAlertsService,
    AlertRulesService,
    HealthAlertEvaluatorService,
  ],
  exports: [HealthAlertEvaluatorService],
})
export class HealthAlertsModule {}
