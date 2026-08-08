import { Module } from '@nestjs/common';

import { HealthAuditService } from './health-audit.service';

@Module({
  providers: [HealthAuditService],
  exports: [HealthAuditService],
})
export class HealthAuditModule {}
