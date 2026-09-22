import { WearableProvider } from '@prisma/client';

import {
  FitbitWearableProvider,
  GarminWearableProvider,
  HealthConnectWearableProvider,
  HealthKitWearableProvider,
} from './unavailable-wearable.provider';
import {
  WearableProviderError,
  WearableProviderErrorCode,
} from './wearable-provider.interface';

describe('Unavailable wearable providers', () => {
  const device = {
    id: '69035a9e-8252-44f1-9b63-38429f26c714',
    provider: WearableProvider.FITBIT,
    deviceName: 'Fitbit',
    externalDeviceId: 'fitbit-device',
  };

  it('marks OAuth providers as known placeholders without fake connectivity', async () => {
    const fitbit = new FitbitWearableProvider();
    const garmin = new GarminWearableProvider();

    expect(fitbit.connectionKind).toBe('oauth');
    expect(garmin.connectionKind).toBe('oauth');
    expect(fitbit.supportsConnection).toBe(false);
    await expect(fitbit.sync(device)).rejects.toMatchObject({
      code: WearableProviderErrorCode.PROVIDER_UNAVAILABLE,
      retryable: false,
    });
  });

  it('marks native mobile providers as known placeholders', async () => {
    const healthConnect = new HealthConnectWearableProvider();
    const healthKit = new HealthKitWearableProvider();

    expect(healthConnect.connectionKind).toBe('native_mobile');
    expect(healthKit.connectionKind).toBe('native_mobile');
    await expect(healthKit.connect({})).rejects.toBeInstanceOf(
      WearableProviderError,
    );
  });

  it('reports expired provider authentication for OAuth placeholders', async () => {
    const provider = new FitbitWearableProvider();

    await expect(provider.refreshAuthentication(device)).rejects.toMatchObject({
      code: WearableProviderErrorCode.AUTHENTICATION_EXPIRED,
      retryable: false,
    });
  });

  it('wraps unexpected provider failures consistently', () => {
    const provider = new FitbitWearableProvider();
    const error = provider.handleProviderError(new Error('timeout'));

    expect(error).toMatchObject({
      code: WearableProviderErrorCode.SYNC_FAILED,
      retryable: true,
    });
  });

  it('does not pretend native mobile authentication can be refreshed server-side', async () => {
    const provider = new HealthConnectWearableProvider();

    await expect(provider.refreshAuthentication(device)).rejects.toMatchObject({
      code: WearableProviderErrorCode.REFRESH_UNSUPPORTED,
      retryable: false,
    });
  });
});
