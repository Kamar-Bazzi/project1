import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../../services/api-error";
import { healthMetricService } from "../../services/health-metric.service";
import { wearableService } from "../../services/wearable.service";
import {
  providerLabels,
  type WearableDevice,
} from "../../types/health";

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

export default function WearablesPage() {
  const [devices, setDevices] = useState<WearableDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deviceLoadError, setDeviceLoadError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mutationKey, setMutationKey] = useState<string | null>(null);

  const loadDevices = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setDeviceLoadError(null);
    try {
      setDevices(await wearableService.list());
    } catch (error) {
      setDeviceLoadError(
        getApiErrorMessage(error, "We could not load your connected devices."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  async function connectDemo(): Promise<void> {
    setMutationKey("connect-demo");
    setPageError(null);
    setSuccess(null);
    try {
      const device = await wearableService.connectDemo();
      setDevices((current) => [
        device,
        ...current.filter((item) => item.id !== device.id),
      ]);
      setSuccess("Demo watch connected. Synchronize it to generate clearly labeled test readings.");
    } catch (error) {
      setPageError(getApiErrorMessage(error, "We could not connect the demo watch."));
    } finally {
      setMutationKey(null);
    }
  }

  async function syncDemo(device: WearableDevice): Promise<void> {
    setMutationKey(`sync-${device.id}`);
    setPageError(null);
    setSuccess(null);
    try {
      await healthMetricService.syncDemo(device.id);
      const refreshed = await wearableService.list();
      setDevices(refreshed);
      setSuccess("Demo data synchronized. These generated values are not medical readings.");
    } catch (error) {
      setPageError(getApiErrorMessage(error, "We could not synchronize demo data."));
    } finally {
      setMutationKey(null);
    }
  }

  async function disconnect(device: WearableDevice): Promise<void> {
    if (!window.confirm(`Disconnect ${device.deviceName}? Its historical measurements will be preserved.`)) {
      return;
    }
    setMutationKey(`disconnect-${device.id}`);
    setPageError(null);
    setSuccess(null);
    try {
      await wearableService.disconnect(device.id);
      setDevices((current) =>
        current.map((item) =>
          item.id === device.id ? { ...item, active: false } : item,
        ),
      );
      setSuccess(`${device.deviceName} disconnected. Existing health history was preserved.`);
    } catch (error) {
      setPageError(getApiErrorMessage(error, "We could not disconnect this device."));
    } finally {
      setMutationKey(null);
    }
  }

  const hasActiveDemo = devices.some(
    (device) => device.provider === "MOCK" && device.active,
  );

  return (
    <main className="page-shell wearables-page">
      <header className="page-heading page-heading-actions">
        <div>
          <p className="eyebrow">Device connections</p>
          <h1>Smartwatches &amp; wearables</h1>
          <p>
            Manage health-data sources connected to your account. Connections and measurements remain isolated to your patient profile.
          </p>
        </div>
        <button
          className="button button-primary"
          disabled={mutationKey !== null || hasActiveDemo}
          onClick={() => void connectDemo()}
        >
          {mutationKey === "connect-demo" ? "Connecting…" : hasActiveDemo ? "Demo watch connected" : "Connect Demo Watch"}
        </button>
      </header>

      <div className="demo-provider-banner">
        <span className="demo-provider-icon" aria-hidden="true">⌚</span>
        <div>
          <div className="badge-row">
            <h2>Development demo provider</h2>
            <span className="badge badge-warning">Mock data only</span>
          </div>
          <p>
            The demo watch generates realistic-looking test values so this integration can be evaluated without owning a smartwatch. Generated readings are not real health measurements and must not be used for medical decisions.
          </p>
        </div>
      </div>

      {pageError && <div className="alert alert-error" role="alert">{pageError}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      <section className="card wearable-devices-section" aria-labelledby="connected-devices-title">
        <div className="section-heading section-heading-actions">
          <div>
            <h2 id="connected-devices-title">Connected devices</h2>
            <p>Disconnecting a device stops future syncs but keeps its measurement history.</p>
          </div>
          <button className="button button-ghost button-small" disabled={isLoading} onClick={() => void loadDevices()}>
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="wearable-device-state" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p>Loading connected devices…</p>
          </div>
        ) : deviceLoadError ? (
          <div className="wearable-device-state" role="alert">
            <span className="state-icon" aria-hidden="true">!</span>
            <h3>Connected devices unavailable</h3>
            <p>{deviceLoadError}</p>
            <button
              className="button button-secondary button-small"
              onClick={() => void loadDevices()}
            >
              Try again
            </button>
          </div>
        ) : devices.length === 0 ? (
          <div className="wearable-device-state empty-state">
            <span className="state-icon" aria-hidden="true">⌚</span>
            <h3>No wearable devices</h3>
            <p>Use Connect Demo Watch above to explore the complete synchronization flow.</p>
          </div>
        ) : (
          <div className="wearable-device-list">
            {devices.map((device) => (
              <article className={`wearable-device-item${device.active ? "" : " is-inactive"}`} key={device.id}>
                <span className="wearable-device-icon" aria-hidden="true">⌚</span>
                <div className="wearable-device-copy">
                  <div className="badge-row">
                    <h3>{device.deviceName}</h3>
                    <span className={`badge ${device.active ? "badge-completed" : "badge-neutral"}`}>
                      {device.active ? "Connected" : "Disconnected"}
                    </span>
                    {device.provider === "MOCK" && <span className="badge badge-warning">Demo</span>}
                  </div>
                  <dl className="wearable-device-details">
                    <div><dt>Provider</dt><dd>{providerLabels[device.provider]}</dd></div>
                    <div><dt>Connected</dt><dd>{formatDateTime(device.connectedAt)}</dd></div>
                    <div><dt>Last sync</dt><dd>{formatDateTime(device.lastSyncAt)}</dd></div>
                  </dl>
                </div>
                <div className="wearable-device-actions">
                  {device.provider === "MOCK" && device.active && (
                    <button
                      className="button button-primary button-small"
                      disabled={mutationKey !== null}
                      onClick={() => void syncDemo(device)}
                    >
                      {mutationKey === `sync-${device.id}` ? "Syncing…" : "Sync Demo Data"}
                    </button>
                  )}
                  {device.active && (
                    <button
                      className="button button-danger-ghost button-small"
                      disabled={mutationKey !== null}
                      onClick={() => void disconnect(device)}
                    >
                      {mutationKey === `disconnect-${device.id}` ? "Disconnecting…" : "Disconnect"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card provider-architecture-card">
        <div>
          <p className="eyebrow">How real integrations work</p>
          <h2>Your watch connects through a phone or provider service</h2>
          <p>
            A normal browser cannot directly read Apple HealthKit, Android Health Connect, or every smartwatch. Apple and Android health stores require companion mobile apps; Fitbit, Garmin, Samsung, and other providers may require OAuth and their supported APIs.
          </p>
        </div>
        <ol className="provider-flow" aria-label="Wearable data flow">
          <li><span>1</span>Smartwatch</li>
          <li><span>2</span>Phone or provider</li>
          <li><span>3</span>CareTrack API</li>
          <li><span>4</span>Your health history</li>
        </ol>
        <Link className="button button-secondary button-small" to="/health">
          View health history
        </Link>
      </section>
    </main>
  );
}
