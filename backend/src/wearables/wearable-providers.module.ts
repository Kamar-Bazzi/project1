import { Module } from '@nestjs/common';

import { MockWearableProvider } from './providers/mock-wearable.provider';
import {
  FitbitWearableProvider,
  GarminWearableProvider,
  HealthConnectWearableProvider,
  HealthKitWearableProvider,
} from './providers/unavailable-wearable.provider';
import { WearableProviderRegistry } from './providers/wearable-provider.registry';

const wearableProviderAdapters = [
  MockWearableProvider,
  FitbitWearableProvider,
  GarminWearableProvider,
  HealthConnectWearableProvider,
  HealthKitWearableProvider,
];

@Module({
  providers: [...wearableProviderAdapters, WearableProviderRegistry],
  exports: [...wearableProviderAdapters, WearableProviderRegistry],
})
export class WearableProvidersModule {}
