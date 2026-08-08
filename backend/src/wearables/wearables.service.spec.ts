import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WearableDevice, WearableProvider } from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { WearableProviderRegistry } from './providers/wearable-provider.registry';
import { WearablesService } from './wearables.service';

describe('WearablesService', () => {
  const device: WearableDevice = {
    id: '69035a9e-8252-44f1-9b63-38429f26c714',
    patientId: 'patient-a',
    provider: WearableProvider.MOCK,
    deviceName: 'Demo Watch',
    externalDeviceId: 'demo-watch',
    connectedAt: new Date('2026-08-08T10:00:00.000Z'),
    lastSyncAt: null,
    active: true,
    createdAt: new Date('2026-08-08T10:00:00.000Z'),
    updatedAt: new Date('2026-08-08T10:00:00.000Z'),
  };
  const patientFindUnique = jest.fn();
  const wearableFindMany = jest.fn();
  const wearableFindFirst = jest.fn();
  const wearableUpsert = jest.fn();
  const wearableUpdate = jest.fn();
  const providerGet = jest.fn();
  const auditRecord = jest.fn();
  const prisma = {
    patient: { findUnique: patientFindUnique },
    wearableDevice: {
      findMany: wearableFindMany,
      findFirst: wearableFindFirst,
      upsert: wearableUpsert,
      update: wearableUpdate,
    },
  };
  const providerRegistry = { get: providerGet };
  const healthAudit = { record: auditRecord };
  const service = new WearablesService(
    prisma as unknown as PrismaService,
    providerRegistry as unknown as WearableProviderRegistry,
    healthAudit as unknown as HealthAuditService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    patientFindUnique.mockResolvedValue({ id: 'patient-a' });
    providerGet.mockReturnValue({ provider: WearableProvider.MOCK });
    auditRecord.mockResolvedValue(undefined);
  });

  it('lists only devices owned by the authenticated patient', async () => {
    wearableFindMany.mockResolvedValue([device]);

    await expect(service.findAllForPatient('user-a')).resolves.toEqual([
      device,
    ]);
    expect(patientFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
      select: { id: true },
    });
    expect(wearableFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: 'patient-a' } }),
    );
    expect(auditRecord).toHaveBeenCalledWith({
      userId: 'user-a',
      action: 'wearable.list',
      entity: 'WearableDevice',
      metadata: { count: 1 },
    });
  });

  it('does not reveal a wearable owned by another patient', async () => {
    wearableFindFirst.mockResolvedValue(null);

    await expect(
      service.findOneForPatient('user-a', device.id),
    ).rejects.toEqual(new NotFoundException('Wearable device not found'));
    expect(wearableFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: device.id, patientId: 'patient-a' },
      }),
    );
  });

  it('audits an owned wearable detail read without recording patient data', async () => {
    wearableFindFirst.mockResolvedValue(device);

    await expect(
      service.findOneForPatient('user-a', device.id),
    ).resolves.toEqual(device);
    expect(auditRecord).toHaveBeenCalledWith({
      userId: 'user-a',
      action: 'wearable.read',
      entity: 'WearableDevice',
      entityId: device.id,
      metadata: { provider: WearableProvider.MOCK },
    });
  });

  it('cannot modify a wearable owned by another patient', async () => {
    wearableFindFirst.mockResolvedValue(null);

    await expect(
      service.updateForPatient('user-a', device.id, {
        deviceName: 'Changed',
      }),
    ).rejects.toEqual(new NotFoundException('Wearable device not found'));
    expect(wearableUpdate).not.toHaveBeenCalled();
  });

  it('updates an owned wearable through a patient-scoped write', async () => {
    const updatedDevice = { ...device, deviceName: 'Renamed Watch' };
    wearableFindFirst.mockResolvedValue(device);
    wearableUpdate.mockResolvedValue(updatedDevice);

    await expect(
      service.updateForPatient('user-a', device.id, {
        deviceName: 'Renamed Watch',
      }),
    ).resolves.toEqual(updatedDevice);
    expect(wearableUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: device.id, patientId: 'patient-a' },
        data: { deviceName: 'Renamed Watch' },
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith({
      userId: 'user-a',
      action: 'wearable.update',
      entity: 'WearableDevice',
      entityId: device.id,
      metadata: { provider: WearableProvider.MOCK },
    });
  });

  it('creates or reconnects one stable demo-watch identity', async () => {
    wearableUpsert.mockResolvedValue(device);

    await expect(
      service.createForPatient('user-a', {
        provider: WearableProvider.MOCK,
      }),
    ).resolves.toEqual(device);
    expect(wearableUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patientId_provider_externalDeviceId: {
            patientId: 'patient-a',
            provider: WearableProvider.MOCK,
            externalDeviceId: 'demo-watch',
          },
        },
        update: { active: true },
        create: {
          patientId: 'patient-a',
          provider: WearableProvider.MOCK,
          deviceName: 'Demo Watch',
          externalDeviceId: 'demo-watch',
        },
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith({
      userId: 'user-a',
      action: 'wearable.connect',
      entity: 'WearableDevice',
      entityId: device.id,
      metadata: { provider: WearableProvider.MOCK },
    });
  });

  it('uses a validated custom name without changing the demo identity', async () => {
    wearableUpsert.mockResolvedValue({
      ...device,
      deviceName: 'Development Watch',
    });

    await service.createForPatient('user-a', {
      provider: WearableProvider.MOCK,
      deviceName: 'Development Watch',
    });

    expect(wearableUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { active: true, deviceName: 'Development Watch' },
      }),
    );
    const [{ create }] = wearableUpsert.mock.calls[0] as unknown as [
      {
        create: { deviceName: string; externalDeviceId: string };
      },
    ];
    expect(create).toMatchObject({
      deviceName: 'Development Watch',
      externalDeviceId: 'demo-watch',
    });
  });

  it('rejects real providers until their native or OAuth integration exists', async () => {
    providerGet.mockReturnValue(undefined);

    await expect(
      service.createForPatient('user-a', {
        provider: WearableProvider.FITBIT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(patientFindUnique).not.toHaveBeenCalled();
    expect(wearableUpsert).not.toHaveBeenCalled();
  });

  it('soft-disconnects an owned wearable and preserves its history', async () => {
    wearableFindFirst.mockResolvedValue(device);
    wearableUpdate.mockResolvedValue({ ...device, active: false });

    await expect(
      service.disconnectForPatient('user-a', device.id),
    ).resolves.toBeUndefined();
    expect(wearableUpdate).toHaveBeenCalledWith({
      where: { id: device.id, patientId: 'patient-a' },
      data: { active: false },
    });
    expect(auditRecord).toHaveBeenCalledWith({
      userId: 'user-a',
      action: 'wearable.disconnect',
      entity: 'WearableDevice',
      entityId: device.id,
      metadata: { provider: WearableProvider.MOCK },
    });
    expect(prisma.wearableDevice).not.toHaveProperty('delete');
    expect(prisma.wearableDevice).not.toHaveProperty('deleteMany');
  });

  it('requires an active owned device when requested by the sync service', async () => {
    wearableFindFirst.mockResolvedValue(device);

    await expect(
      service.requireOwnedDeviceForPatient('patient-a', device.id, {
        activeOnly: true,
      }),
    ).resolves.toEqual(device);
    expect(wearableFindFirst).toHaveBeenCalledWith({
      where: { id: device.id, patientId: 'patient-a', active: true },
    });
  });

  it('returns a sanitized 404 when the authenticated user has no patient', async () => {
    patientFindUnique.mockResolvedValue(null);

    await expect(
      service.findAllForPatient('user-without-profile'),
    ).rejects.toEqual(new NotFoundException('Patient profile not found'));
    expect(wearableFindMany).not.toHaveBeenCalled();
  });
});
