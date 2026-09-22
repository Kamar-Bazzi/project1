import { NotFoundException } from '@nestjs/common';

import { SymptomsService } from './symptoms.service';

describe('SymptomsService', () => {
  const transaction = {
    medication: { count: jest.fn() },
    measurement: { count: jest.fn() },
    symptomEntry: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (operation: (database: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const access = {
    getPatientForUser: jest.fn().mockResolvedValue({ id: 'patient-1' }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new SymptomsService(
    prisma as never,
    access as never,
    audit as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns scoped not-found when a linked medication is not owned', async () => {
    transaction.medication.count.mockResolvedValue(0);
    transaction.measurement.count.mockResolvedValue(0);

    await expect(
      service.create('user-1', {
        name: 'Headache',
        severity: 4,
        occurredAt: '2020-08-22T08:00:00.000Z',
        medicationIds: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.symptomEntry.create).not.toHaveBeenCalled();
  });
});
