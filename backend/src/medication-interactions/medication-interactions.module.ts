import { Module } from '@nestjs/common';

import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { InteractionReferenceProvider } from './interaction-reference.provider';
import { MedicationInteractionsService } from './medication-interactions.service';

@Module({
  imports: [ClinicalAccessModule, HealthAuditModule],
  providers: [InteractionReferenceProvider, MedicationInteractionsService],
  exports: [MedicationInteractionsService],
})
export class MedicationInteractionsModule {}
