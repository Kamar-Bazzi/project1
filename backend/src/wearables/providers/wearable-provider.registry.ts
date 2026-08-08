import { Injectable } from '@nestjs/common';
import { WearableProvider } from '@prisma/client';

import { MockWearableProvider } from './mock-wearable.provider';
import { WearableProviderAdapter } from './wearable-provider.interface';

@Injectable()
export class WearableProviderRegistry {
  private readonly providers: ReadonlyMap<
    WearableProvider,
    WearableProviderAdapter
  >;

  constructor(mockWearableProvider: MockWearableProvider) {
    this.providers = new Map<WearableProvider, WearableProviderAdapter>([
      [mockWearableProvider.provider, mockWearableProvider],
    ]);
  }

  get(provider: WearableProvider): WearableProviderAdapter | undefined {
    return this.providers.get(provider);
  }
}
