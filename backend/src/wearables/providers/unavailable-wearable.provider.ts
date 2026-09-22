import { Injectable } from '@nestjs/common';
import { WearableProvider } from '@prisma/client';

import {
  WearableProviderAdapter,
  WearableProviderConnectInput,
  WearableProviderConnection,
  WearableProviderConnectionKind,
  WearableProviderError,
  WearableProviderErrorCode,
  WearableProviderMeasurement,
  WearableProviderOperationResult,
  WearableProviderSyncResult,
} from './wearable-provider.interface';

abstract class UnavailableWearableProvider implements WearableProviderAdapter {
  readonly isDemo = false;
  readonly supportsConnection = false;

  protected constructor(
    readonly provider: WearableProvider,
    readonly connectionKind: WearableProviderConnectionKind,
    readonly unavailableMessage: string,
    private readonly authenticationRefreshSupported: boolean,
  ) {}

  connect(
    input: WearableProviderConnectInput,
  ): Promise<WearableProviderConnection> {
    void input;

    return Promise.reject(this.unavailableError());
  }

  disconnect(): Promise<WearableProviderOperationResult> {
    return Promise.resolve({ success: true });
  }

  sync(): Promise<WearableProviderSyncResult> {
    return Promise.reject(this.unavailableError());
  }

  refreshAuthentication(): Promise<WearableProviderOperationResult> {
    return Promise.reject(
      new WearableProviderError(
        this.authenticationRefreshSupported
          ? WearableProviderErrorCode.AUTHENTICATION_EXPIRED
          : WearableProviderErrorCode.REFRESH_UNSUPPORTED,
        this.authenticationRefreshSupported
          ? `${this.provider} authentication is expired and no OAuth token store is configured.`
          : `${this.provider} authentication is managed by the native mobile integration.`,
        false,
      ),
    );
  }

  normalizeProviderMetrics(rawMetrics: unknown): WearableProviderMeasurement[] {
    void rawMetrics;

    throw new WearableProviderError(
      WearableProviderErrorCode.NORMALIZATION_FAILED,
      `${this.provider} metric normalization is not implemented yet.`,
      false,
    );
  }

  handleProviderError(error: unknown): WearableProviderError {
    if (error instanceof WearableProviderError) {
      return error;
    }

    return new WearableProviderError(
      WearableProviderErrorCode.SYNC_FAILED,
      `${this.provider} wearable provider failed.`,
      true,
      error,
    );
  }

  private unavailableError(): WearableProviderError {
    return new WearableProviderError(
      WearableProviderErrorCode.PROVIDER_UNAVAILABLE,
      this.unavailableMessage,
      false,
    );
  }
}

@Injectable()
export class FitbitWearableProvider extends UnavailableWearableProvider {
  constructor() {
    super(
      WearableProvider.FITBIT,
      'oauth',
      'Fitbit requires a configured OAuth application, scopes, callback handling, and secure token storage before it can connect.',
      true,
    );
  }
}

@Injectable()
export class GarminWearableProvider extends UnavailableWearableProvider {
  constructor() {
    super(
      WearableProvider.GARMIN,
      'oauth',
      'Garmin requires an approved provider API integration, OAuth/token lifecycle handling, and secure token storage before it can connect.',
      true,
    );
  }
}

@Injectable()
export class HealthConnectWearableProvider extends UnavailableWearableProvider {
  constructor() {
    super(
      WearableProvider.HEALTH_CONNECT,
      'native_mobile',
      'Health Connect requires an Android companion app with user-granted permissions before it can connect.',
      false,
    );
  }
}

@Injectable()
export class HealthKitWearableProvider extends UnavailableWearableProvider {
  constructor() {
    super(
      WearableProvider.HEALTHKIT,
      'native_mobile',
      'HealthKit requires an iOS companion app with HealthKit entitlements and user-granted permissions before it can connect.',
      false,
    );
  }
}
