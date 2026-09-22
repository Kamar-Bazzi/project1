import { CheckInMedicationAdherence } from '@prisma/client';

import { CheckInsService } from './check-ins.service';

describe('CheckInsService', () => {
  const transaction = { dailyCheckIn: { upsert: jest.fn() } };
  const prisma = {
    $transaction: jest.fn(
      (operation: (database: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const access = {
    getPatientForUser: jest.fn().mockResolvedValue({
      id: 'patient-1',
      timeZone: 'Asia/Beirut',
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new CheckInsService(
    prisma as never,
    access as never,
    audit as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.dailyCheckIn.upsert.mockResolvedValue({
      id: 'check-in-1',
      localDate: new Date('2026-08-22T00:00:00.000Z'),
    });
  });

  it('upserts by the patient local date and de-duplicates symptom labels', async () => {
    await service.upsertToday(
      'user-1',
      {
        mood: 4,
        painLevel: 2,
        sleepQuality: 3,
        symptoms: ['Headache', 'Headache'],
        activityMinutes: 25,
        medicationAdherence: CheckInMedicationAdherence.ALL_TAKEN,
        notes: null,
      },
      undefined,
      new Date('2026-08-21T22:30:00.000Z'),
    );

    expect(transaction.dailyCheckIn.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patientId_localDate: {
            patientId: 'patient-1',
            localDate: new Date('2026-08-22T00:00:00.000Z'),
          },
        },
        update: expect.objectContaining({
          timeZone: 'Asia/Beirut',
          symptoms: ['Headache'],
        }) as unknown,
      }),
    );
  });
});
