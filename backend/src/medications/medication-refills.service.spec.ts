import { Logger, NotFoundException } from '@nestjs/common';

import { MedicationRefillsService } from './medication-refills.service';

describe('MedicationRefillsService', () => {
  const transaction = {
    medication: { findFirst: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (operation: (database: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const access = {
    getPatientForUser: jest.fn().mockResolvedValue({
      id: 'patient-1',
      timeZone: 'UTC' as string | null,
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = { notifyMedicationRefillLow: jest.fn() };
  const service = new MedicationRefillsService(
    prisma as never,
    access as never,
    audit as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    access.getPatientForUser.mockResolvedValue({
      id: 'patient-1',
      timeZone: 'UTC',
    });
    transaction.medication.findFirst.mockResolvedValue({ id: 'med-1' });
    transaction.medication.update.mockResolvedValue({
      id: 'med-1',
      name: 'Example medicine',
      remainingQuantity: 3,
      lowQuantityThreshold: 5,
      quantityUnit: 'tablets',
      nextRefillDate: null,
      pharmacyName: null,
      schedules: [],
      logs: [],
    });
  });

  it('returns the committed low-supply result even if notification delivery fails', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    notifications.notifyMedicationRefillLow.mockRejectedValue(
      new Error('provider unavailable'),
    );

    await expect(
      service.update('user-1', 'med-1', {
        remainingQuantity: 3,
        lowQuantityThreshold: 5,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'med-1',
        refillStatus: 'LOW',
        lowSupplyWarning: expect.stringContaining(
          'low-supply threshold',
        ) as unknown,
      }),
    );
    expect(notifications.notifyMedicationRefillLow).toHaveBeenCalledWith(
      'med-1',
      'UTC',
    );
  });

  it('uses the request time zone when a legacy patient has none stored', async () => {
    access.getPatientForUser.mockResolvedValue({
      id: 'patient-1',
      timeZone: null,
    });

    await expect(
      service.update(
        'user-1',
        'med-1',
        { remainingQuantity: 3, lowQuantityThreshold: 5 },
        'Asia/Beirut',
      ),
    ).resolves.toEqual(expect.objectContaining({ timeZone: 'Asia/Beirut' }));
    expect(notifications.notifyMedicationRefillLow).toHaveBeenCalledWith(
      'med-1',
      'Asia/Beirut',
    );
  });

  it('uses a scoped not-found response for a foreign medication id', async () => {
    transaction.medication.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user-1', 'foreign-med', { remainingQuantity: 3 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
