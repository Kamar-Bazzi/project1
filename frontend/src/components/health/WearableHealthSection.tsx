import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../../services/api-error";
import { healthMetricService } from "../../services/health-metric.service";
import { wearableService } from "../../services/wearable.service";
import {
  formatMetricValue,
  healthMetricPresentation,
  type HealthMetric,
  type HealthMetricType,
  type WearableDevice,
} from "../../types/health";

type HealthSummaryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      devices: WearableDevice[];
      metrics: HealthMetric[];
    };

const summaryTypes: HealthMetricType[] = [
  "HEART_RATE",
  "RESTING_HEART_RATE",
  "STEPS",
  "DISTANCE",
  "CALORIES",
  "SLEEP_DURATION",
  "BLOOD_OXYGEN",
];

const todayOnlyTypes = new Set<HealthMetricType>([
  "STEPS",
  "DISTANCE",
  "CALORIES",
  "SLEEP_DURATION",
]);

const summaryLabels: Partial<Record<HealthMetricType, string>> = {
  HEART_RATE: "Latest heart rate",
  BLOOD_OXYGEN: "Latest blood oxygen",
};

function isToday(value: string): boolean {
  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function latestByType(metrics: HealthMetric[]): Map<HealthMetricType, HealthMetric> {
  const result = new Map<HealthMetricType, HealthMetric>();

  [...metrics]
    .sort(
      (left, right) =>
        new Date(right.measuredAt).getTime() - new Date(left.measuredAt).getTime(),
    )
    .forEach((metric) => {
      if (!result.has(metric.metricType)) result.set(metric.metricType, metric);
    });

  return result;
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "Not synced yet";

  const elapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (elapsedSeconds < 60) return "Just now";

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return new Date(value).toLocaleDateString();
}

function formatMetricTimestamp(value: string): string {
  const date = new Date(value);

  return isToday(value)
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function WearableHealthSection() {
  const [state, setState] = useState<HealthSummaryState>({ status: "loading" });

  const loadSummary = useCallback(async (): Promise<void> => {
    setState({ status: "loading" });

    try {
      const devices = await wearableService.list();
      const activeDevices = devices.filter((device) => device.active);

      if (activeDevices.length === 0) {
        setState({ status: "ready", devices, metrics: [] });
        return;
      }

      const metrics = await healthMetricService.latest();
      setState({ status: "ready", devices, metrics });
    } catch (error) {
      setState({
        status: "error",
        message: getApiErrorMessage(
          error,
          "We could not load your wearable health summary.",
        ),
      });
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const latestMetrics = useMemo(
    () => (state.status === "ready" ? latestByType(state.metrics) : new Map()),
    [state],
  );

  return (
    <section className="dashboard-health-section" aria-labelledby="today-health-title">
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">Wearable health</p>
          <h2 id="today-health-title">Today&apos;s health</h2>
          <p>Measurements synchronized from your connected health provider.</p>
        </div>
        <Link className="button button-secondary button-small" to="/health">
          View history
        </Link>
      </div>

      {state.status === "loading" ? (
        <div className="card wearable-summary-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading wearable health…</p>
        </div>
      ) : state.status === "error" ? (
        <div className="card wearable-summary-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <h3>Wearable health unavailable</h3>
          <p>{state.message}</p>
          <button className="button button-primary button-small" onClick={() => void loadSummary()}>
            Try again
          </button>
        </div>
      ) : !state.devices.some((device) => device.active) ? (
        <div className="card wearable-summary-state empty-state">
          <span className="state-icon" aria-hidden="true">⌁</span>
          <h3>No smartwatch connected</h3>
          <p>Connect the development demo watch to explore wearable health tracking.</p>
          <Link className="button button-primary button-small" to="/wearables">
            Connect a device
          </Link>
        </div>
      ) : state.metrics.length === 0 ? (
        <div className="card wearable-summary-state empty-state">
          <span className="state-icon" aria-hidden="true">↻</span>
          <h3>No synchronized readings yet</h3>
          <p>Your device is connected. Synchronize it to populate this health summary.</p>
          <Link className="button button-primary button-small" to="/wearables">
            Sync a device
          </Link>
        </div>
      ) : (
        <>
          {state.devices.some((device) => device.active && device.provider === "MOCK") && (
            <p className="demo-data-notice">
              <span className="badge badge-warning">Demo data</span>
              Generated readings are for product demonstration only and are not medical measurements.
            </p>
          )}

          <div className="health-summary-grid">
            {summaryTypes.map((metricType) => {
              const presentation = healthMetricPresentation[metricType];
              const candidate = latestMetrics.get(metricType);
              const metric =
                candidate &&
                (!todayOnlyTypes.has(metricType) || isToday(candidate.measuredAt))
                  ? candidate
                  : undefined;

              return (
                <article className="health-summary-card" key={metricType}>
                  <span className={`health-metric-icon health-metric-icon-${metricType.toLowerCase().replace(/_/g, "-")}`} aria-hidden="true">
                    {presentation.icon}
                  </span>
                  <div>
                    <p>{summaryLabels[metricType] ?? presentation.shortLabel}</p>
                    <strong>{metric ? formatMetricValue(metric) : "—"}</strong>
                    <small>
                      {metric
                        ? formatMetricTimestamp(metric.measuredAt)
                        : todayOnlyTypes.has(metricType)
                          ? "No reading today"
                          : "No reading yet"}
                    </small>
                  </div>
                </article>
              );
            })}

            <article className="health-summary-card health-sync-card">
              <span className="health-metric-icon" aria-hidden="true">↻</span>
              <div>
                <p>Last sync</p>
                <strong>
                  {formatRelativeTime(
                    state.devices
                      .filter((device) => device.active && device.lastSyncAt)
                      .map((device) => device.lastSyncAt)
                      .sort((left, right) =>
                        new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime(),
                      )[0] ?? null,
                  )}
                </strong>
                <small>{state.devices.filter((device) => device.active).length} active device(s)</small>
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
