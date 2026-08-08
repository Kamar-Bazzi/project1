import { Module } from '@nestjs/common';

import { MockWearableProvider } from './providers/mock-wearable.provider';
import { WearableProviderRegistry } from './providers/wearable-provider.registry';

@Module({
  providers: [MockWearableProvider, WearableProviderRegistry],
  exports: [MockWearableProvider, WearableProviderRegistry],
})
export class WearableProvidersModule {}
