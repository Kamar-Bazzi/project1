import { Module } from '@nestjs/common';

import { ClinicalAccessService } from './clinical-access.service';

@Module({
  providers: [ClinicalAccessService],
  exports: [ClinicalAccessService],
})
export class ClinicalAccessModule {}
