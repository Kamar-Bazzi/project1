import { MedicationStatus } from '@prisma/client';

import { InteractionReferenceProvider } from './interaction-reference.provider';
import { MedicationInteractionsService } from './medication-interactions.service';

describe('MedicationInteractionsService', () => {
  const medicationFindMany = jest.fn();
  const prisma = { medication: { findMany: medicationFindMany } };
  const access = {
    getPatientForUser: jest.fn().mockResolvedValue({ id: 'patient-1' }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new MedicationInteractionsService(
    prisma as never,
    access as never,
    audit as never,
    new InteractionReferenceProvider(),
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns one unordered medication-pair warning with provenance', async () => {
    medicationFindMany.mockResolvedValue([
      { id: 'nitrate-1', name: 'Nitroglycerin' },
      { id: 'sildenafil-1', name: 'Viagra' },
    ]);

    const result = await service.checkForPatient(
      'user-1',
      new Date('2026-08-22T12:00:00.000Z'),
    );

    expect(medicationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patientId: 'patient-1',
          status: MedicationStatus.ACTIVE,
        },
      }),
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].medications.map(({ id }) => id).sort()).toEqual([
      'nitrate-1',
      'sildenafil-1',
    ]);
    expect(result.warnings[0].sourceIds).toEqual([
      'DAILYMED_SILDENAFIL_2026_08_22',
    ]);
    expect(result.reference.sources[0].url).toContain('dailymed.nlm.nih.gov');
  });

  it('reports exact-match misses instead of guessing an interaction', async () => {
    medicationFindMany.mockResolvedValue([
      { id: 'med-1', name: 'Sildenafil 50 mg' },
      { id: 'med-2', name: 'Unknown medicine' },
    ]);

    const result = await service.checkForPatient('user-1');

    expect(result.warnings).toEqual([]);
    expect(result.unmatchedMedications).toEqual([
      { id: 'med-1', name: 'Sildenafil 50 mg' },
      { id: 'med-2', name: 'Unknown medicine' },
    ]);
  });

  it('uses review-only language and never directs a treatment change', async () => {
    medicationFindMany.mockResolvedValue([
      { id: 'med-1', name: 'spironolactone' },
      { id: 'med-2', name: 'lisinopril' },
    ]);

    const result = await service.checkForPatient('user-1');
    const warning = result.warnings[0];

    expect(warning.summary.toLowerCase()).toContain('possible interaction');
    expect(warning.reviewRecommendation.toLowerCase()).toContain('review');
    expect(warning.reviewRecommendation.toLowerCase()).not.toMatch(
      /\b(stop|discontinue|reduce|increase)\b/,
    );
    expect(result.disclaimer.toLowerCase()).toContain('not diagnoses');
  });
});
