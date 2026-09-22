import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { ClinicalAccessModule } from '../common/clinical-access/clinical-access.module';
import { HealthAuditModule } from '../common/health-audit/health-audit.module';
import { DocumentMalwareScannerService } from './document-malware-scanner.service';
import { DocumentStorageService } from './document-storage.service';
import {
  DoctorDocumentsController,
  PatientDocumentsController,
} from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [ConfigModule, AuthModule, ClinicalAccessModule, HealthAuditModule],
  controllers: [PatientDocumentsController, DoctorDocumentsController],
  providers: [
    DocumentsService,
    DocumentStorageService,
    DocumentMalwareScannerService,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
