import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WearableDevice } from '@prisma/client';

import { HealthAuditService } from '../common/health-audit/health-audit.service';
import { paginationMetadata } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWearableDto } from './dto/create-wearable.dto';
import { UpdateWearableDto } from './dto/update-wearable.dto';
import { WearableSyncHistoryQueryDto } from './dto/wearable-sync-history-query.dto';
import { WearableProviderRegistry } from './providers/wearable-provider.registry';
import {
  WearableProviderError,
  WearableProviderErrorCode,
} from './providers/wearable-provider.interface';

const wearableDeviceResponseSelect = {
  id: true,
  provider: true,
  deviceName: true,
  externalDeviceId: true,
  connectedAt: true,
  lastSyncAt: true,
  active: true,
  syncWarningAfterHours: true,
  staleNotificationSentAt: true,
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

  async findSyncHistoryForPatient(
    userId: string,
    query: WearableSyncHistoryQueryDto,
  ) {
    const patientId = await this.getPatientId(userId);
    const where: Prisma.WearableSyncRunWhereInput = {
      patientId,
      wearableDeviceId: query.wearableDeviceId,
      status: query.status,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.wearableSyncRun.findMany({
        where,
        select: {
          id: true,
          wearableDeviceId: true,
          provider: true,
          status: true,
          receivedCount: true,
          importedCount: true,
          duplicateCount: true,
          rejectedCount: true,
          errorCount: true,
          errors: true,
          startedAt: true,
          completedAt: true,
          wearableDevice: { select: { deviceName: true } },
        },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.wearableSyncRun.count({ where }),
    ]);

    await this.healthAudit.record({
      userId,
      action: 'WEARABLE_SYNC_HISTORY_ACCESSED',
      entity: 'WearableSyncRun',
      metadata: { count: items.length, resultCount: total },
    });

    return {
      items,
      pagination: paginationMetadata(query.page, query.pageSize, total),
    };
  }

  async createForPatient(
    userId: string,
    createDto: CreateWearableDto,
  ): Promise<WearableDeviceResponse> {
    const provider = this.providerRegistry.get(createDto.provider);

    if (!provider) {
      throw new BadRequestException('Unsupported wearable provider.');
    }

    if (!provider.supportsConnection) {
      throw new BadRequestException(provider.unavailableMessage);
    }

    const patientId = await this.getPatientId(userId);
    const connection = await provider.connect({
      userId,
      patientId,
      deviceName: createDto.deviceName,
    });
    const updateData: Prisma.WearableDeviceUpdateInput = { active: true };

    if (createDto.deviceName !== undefined) {
      updateData.deviceName = connection.deviceName;
    }

    const device = await this.prisma.wearableDevice.upsert({
      where: {
        patientId_provider_externalDeviceId: {
          patientId,
          provider: connection.provider,
          externalDeviceId: connection.externalDeviceId,
        },
      },
      update: updateData,
      create: {
        patientId,
        provider: connection.provider,
        deviceName: connection.deviceName,
        externalDeviceId: connection.externalDeviceId,
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
    if (updateDto.syncWarningAfterHours !== undefined) {
      data.syncWarningAfterHours = updateDto.syncWarningAfterHours;
      data.staleNotificationSentAt = null;
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
    const provider = this.providerRegistry.get(device.provider);

    try {
      await provider?.disconnect(device, { userId, patientId });
    } catch (error) {
      const providerError =
        provider?.handleProviderError(error) ??
        new WearableProviderError(
          WearableProviderErrorCode.DISCONNECT_FAILED,
          'Wearable provider disconnect failed.',
          true,
          error,
        );

      throw new BadRequestException(providerError.message);
    }

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
