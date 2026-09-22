import { Injectable } from '@nestjs/common';
import { WearableProvider } from '@prisma/client';

import { MockWearableProvider } from './mock-wearable.provider';
import {
  FitbitWearableProvider,
  GarminWearableProvider,
  HealthConnectWearableProvider,
  HealthKitWearableProvider,
} from './unavailable-wearable.provider';
import { WearableProviderAdapter } from './wearable-provider.interface';

@Injectable()
export class WearableProviderRegistry {
  private readonly providers: ReadonlyMap<
    WearableProvider,
    WearableProviderAdapter
  >;

  constructor(
    mockWearableProvider: MockWearableProvider,
    fitbitWearableProvider: FitbitWearableProvider,
    garminWearableProvider: GarminWearableProvider,
    healthConnectWearableProvider: HealthConnectWearableProvider,
    healthKitWearableProvider: HealthKitWearableProvider,
  ) {
    this.providers = new Map<WearableProvider, WearableProviderAdapter>([
      [mockWearableProvider.provider, mockWearableProvider],
      [fitbitWearableProvider.provider, fitbitWearableProvider],
      [garminWearableProvider.provider, garminWearableProvider],
      [healthConnectWearableProvider.provider, healthConnectWearableProvider],
      [healthKitWearableProvider.provider, healthKitWearableProvider],
    ]);
  }

  get(provider: WearableProvider): WearableProviderAdapter | undefined {
    return this.providers.get(provider);
  }
}
