import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WearableDevice, WearableProvider } from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWearableDto } from './dto/create-wearable.dto';
import { UpdateWearableDto } from './dto/update-wearable.dto';
import { WearableProviderRegistry } from './providers/wearable-provider.registry';

const DEMO_EXTERNAL_DEVICE_ID = 'demo-watch';
const DEFAULT_DEMO_DEVICE_NAME = 'Demo Watch';

const wearableDeviceResponseSelect = {
  id: true,
  provider: true,
  deviceName: true,
  externalDeviceId: true,
  connectedAt: true,
  lastSyncAt: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WearableDeviceSelect;

export type WearableDeviceResponse = Prisma.WearableDeviceGetPayload<{
  select: typeof wearableDeviceResponseSelect;
}>;

export interface OwnedDeviceOptions {
  activeOnly?: boolean;
}

@Injectable()
export class WearablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WearableProviderRegistry,
    private readonly healthAudit: HealthAuditService,
  ) {}

  async findAllForPatient(userId: string): Promise<WearableDeviceResponse[]> {
    const patientId = await this.getPatientId(userId);

    const devices = await this.prisma.wearableDevice.findMany({
      where: { patientId },
      select: wearableDeviceResponseSelect,
      orderBy: [{ active: 'desc' }, { connectedAt: 'desc' }],
    });

    await this.healthAudit.record({
      userId,
      action: 'wearable.list',
      entity: 'WearableDevice',
      metadata: { count: devices.length },
    });

    return devices;
  }

  async findOneForPatient(
    userId: string,
    deviceId: string,
  ): Promise<WearableDeviceResponse> {
    const patientId = await this.getPatientId(userId);
    const device = await this.prisma.wearableDevice.findFirst({
      where: { id: deviceId, patientId },
      select: wearableDeviceResponseSelect,
    });

    if (!device) {
      throw new NotFoundException('Wearable device not found');
    }

    await this.healthAudit.record({
      userId,
      action: 'wearable.read',
      entity: 'WearableDevice',
      entityId: device.id,
      metadata: { provider: device.provider },
    });

    return device;
  }

  async createForPatient(
    userId: string,
    createDto: CreateWearableDto,
  ): Promise<WearableDeviceResponse> {
    const provider = this.providerRegistry.get(createDto.provider);

    if (createDto.provider !== WearableProvider.MOCK || !provider) {
      throw new BadRequestException(
        'This wearable provider is not available in the web demo. HealthKit and Health Connect require a companion mobile app; other providers require a supported provider API integration.',
      );
    }

    const patientId = await this.getPatientId(userId);
    const updateData: Prisma.WearableDeviceUpdateInput = { active: true };

    if (createDto.deviceName !== undefined) {
      updateData.deviceName = createDto.deviceName;
    }

    const device = await this.prisma.wearableDevice.upsert({
      where: {
        patientId_provider_externalDeviceId: {
          patientId,
          provider: WearableProvider.MOCK,
          externalDeviceId: DEMO_EXTERNAL_DEVICE_ID,
        },
      },
      update: updateData,
      create: {
        patientId,
        provider: WearableProvider.MOCK,
        deviceName: createDto.deviceName ?? DEFAULT_DEMO_DEVICE_NAME,
        externalDeviceId: DEMO_EXTERNAL_DEVICE_ID,
      },
      select: wearableDeviceResponseSelect,
    });

    await this.healthAudit.record({
      userId,
      action: 'wearable.connect',
      entity: 'WearableDevice',
      entityId: device.id,
      metadata: { provider: device.provider },
    });

    return device;
  }

  async updateForPatient(
    userId: string,
    deviceId: string,
    updateDto: UpdateWearableDto,
  ): Promise<WearableDeviceResponse> {
    const patientId = await this.getPatientId(userId);
    await this.requireOwnedDeviceForPatient(patientId, deviceId);

    const data: Prisma.WearableDeviceUpdateInput = {};

    if (updateDto.deviceName !== undefined) {
      data.deviceName = updateDto.deviceName;
    }

    if (updateDto.active !== undefined) {
      data.active = updateDto.active;
    }

    const device = await this.prisma.wearableDevice.update({
      where: { id: deviceId, patientId },
      data,
      select: wearableDeviceResponseSelect,
    });

    await this.healthAudit.record({
      userId,
      action: 'wearable.update',
      entity: 'WearableDevice',
      entityId: device.id,
      metadata: { provider: device.provider },
    });

    return device;
  }

  async disconnectForPatient(userId: string, deviceId: string): Promise<void> {
    const patientId = await this.getPatientId(userId);
    const device = await this.requireOwnedDeviceForPatient(patientId, deviceId);

    await this.prisma.wearableDevice.update({
      where: { id: deviceId, patientId },
      data: { active: false },
    });

    await this.healthAudit.record({
      userId,
      action: 'wearable.disconnect',
      entity: 'WearableDevice',
      entityId: deviceId,
      metadata: { provider: device.provider },
    });
  }

  async requireOwnedDeviceForUser(
    userId: string,
    deviceId: string,
    options: OwnedDeviceOptions = {},
  ): Promise<WearableDevice> {
    const patientId = await this.getPatientId(userId);

    return this.requireOwnedDeviceForPatient(patientId, deviceId, options);
  }

  async requireOwnedDeviceForPatient(
    patientId: string,
    deviceId: string,
    options: OwnedDeviceOptions = {},
  ): Promise<WearableDevice> {
    const device = await this.prisma.wearableDevice.findFirst({
      where: {
        id: deviceId,
        patientId,
        ...(options.activeOnly ? { active: true } : {}),
      },
    });

    if (!device) {
      throw new NotFoundException('Wearable device not found');
    }

    return device;
  }

  async getPatientId(userId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    return patient.id;
  }
}
