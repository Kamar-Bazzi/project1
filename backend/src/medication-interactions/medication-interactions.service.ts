import { Injectable } from '@nestjs/common';
import { MedicationStatus } from '@prisma/client';

import { ClinicalAccessService } from '../common/clinical-access/clinical-access.service';
import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { InteractionReferenceProvider } from './interaction-reference.provider';

const DISCLAIMER =
  'These are possible interaction flags from a limited offline reference set. They are not diagnoses, do not prove that harm will occur, and do not direct any treatment change. Ask a qualified clinician or pharmacist to review questions about your medicines.';
const REVIEW_RECOMMENDATION =
  'Ask a clinician or pharmacist to review this possible interaction. Do not use this flag by itself to make a treatment decision.';

@Injectable()
export class MedicationInteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly audit: HealthAuditService,
    private readonly reference: InteractionReferenceProvider,
  ) {}

  async checkForPatient(userId: string, checkedAt = new Date()) {
    const patient = await this.access.getPatientForUser(userId);
    const medications = await this.prisma.medication.findMany({
      where: { patientId: patient.id, status: MedicationStatus.ACTIVE },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    const matched = medications.flatMap((medication) => {
      const reference = this.reference.match(medication.name);
      return reference ? [{ ...medication, ...reference }] : [];
    });
    const matchedIds = new Set(matched.map((medication) => medication.id));
    const warnings: Array<{
      medications: Array<{ id: string; name: string; canonicalId: string }>;
      summary: string;
      reviewRecommendation: string;
      sourceIds: readonly string[];
    }> = [];
    const warningKeys = new Set<string>();

    for (const interaction of this.reference.interactions()) {
      const first = matched.filter(
        (medication) => medication.canonicalId === interaction.canonicalIds[0],
      );
      const second = matched.filter(
        (medication) => medication.canonicalId === interaction.canonicalIds[1],
      );
      for (const left of first) {
        for (const right of second) {
          if (left.id === right.id) continue;
          const key = [left.id, right.id].sort().join(':');
          if (warningKeys.has(key)) continue;
          warningKeys.add(key);
          warnings.push({
            medications: [left, right].map(({ id, name, canonicalId }) => ({
              id,
              name,
              canonicalId,
            })),
            summary: interaction.summary,
            reviewRecommendation: REVIEW_RECOMMENDATION,
            sourceIds: interaction.sourceIds,
          });
        }
      }
    }

    await this.audit.record({
      userId,
      action: 'MEDICATION_INTERACTIONS_REVIEWED',
      entity: 'Medication',
      metadata: {
        patientId: patient.id,
        count: warnings.length,
        resultCount: medications.length,
      },
    });
    return {
      checkedAt,
      reference: this.reference.metadata(),
      warnings,
      unmatchedMedications: medications.filter(
        (medication) => !matchedIds.has(medication.id),
      ),
      disclaimer: DISCLAIMER,
    };
  }
}
