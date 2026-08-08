import { useCallback, useEffect, useMemo, useState } from "react";
import AlertRulesPanel from "../../components/health/AlertRulesPanel";
import HealthAlertsPanel from "../../components/health/HealthAlertsPanel";
import HealthMetricChart from "../../components/health/HealthMetricChart";
import { getApiErrorMessage } from "../../services/api-error";
import { healthMetricService } from "../../services/health-metric.service";
import {
  formatMetricValue,
  healthMetricPresentation,
  healthMetricTypes,
  providerLabels,
  type HealthMetric,
  type HealthMetricSource,
  type HealthMetricType,
} from "../../types/health";

type RangePreset = "TODAY" | "SEVEN_DAYS" | "THIRTY_DAYS" | "CUSTOM";

function toLocalDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string, endOfDay: boolean): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date;
}

function rangeForPreset(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const now = new Date();
  let from: Date;
  let to = now;

  if (preset === "CUSTOM") {
    const parsedFrom = parseLocalDate(customFrom, false);
    const parsedTo = parseLocalDate(customTo, true);
    if (!parsedFrom || !parsedTo) throw new Error("Choose a valid start and end date.");
    if (parsedFrom.getTime() > parsedTo.getTime()) {
      throw new Error("The start date must be on or before the end date.");
    }
    from = parsedFrom;
    to = parsedTo;
  } else {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    if (preset === "SEVEN_DAYS") from.setDate(from.getDate() - 6);
    if (preset === "THIRTY_DAYS") from.setDate(from.getDate() - 29);
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

function sourceLabel(source: HealthMetricSource): string {
  if (source === "MANUAL") return "Manual entry";
  return providerLabels[source];
}

export default function HealthPage() {
  const today = toLocalDateInput(new Date());
  const [metricType, setMetricType] = useState<HealthMetricType>("HEART_RATE");
  const [preset, setPreset] = useState<RangePreset>("SEVEN_DAYS");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async (): Promise<void> => {
    let range: { from: string; to: string };
    try {
      range = rangeForPreset(preset, customFrom, customTo);
    } catch (rangeError) {
      setMetrics([]);
      setError(rangeError instanceof Error ? rangeError.message : "Choose a valid date range.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const history = await healthMetricService.history({
        metricType,
        from: range.from,
        to: range.to,
        limit: 500,
      });
      setMetrics(history);
    } catch (loadError) {
      setError(
        getApiErrorMessage(loadError, "We could not load your wearable health history."),
      );
      setMetrics([]);
    } finally {
      setIsLoading(false);
    }
  }, [customFrom, customTo, metricType, preset]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const sortedMetrics = useMemo(
    () =>
      [...metrics].sort(
        (left, right) =>
          new Date(left.measuredAt).getTime() - new Date(right.measuredAt).getTime(),
      ),
    [metrics],
  );
  const newestFirst = [...sortedMetrics].reverse();
  const presentation = healthMetricPresentation[metricType];

  return (
    <main className="page-shell health-page">
      <header className="page-heading page-heading-actions">
        <div>
          <p className="eyebrow">Wearable history</p>
          <h1>Health trends</h1>
          <p>
            Review synchronized measurements over time. Wearable data supports tracking and does not replace professional medical evaluation.
          </p>
        </div>
      </header>

      <section className="card health-history-section" aria-labelledby="history-title">
        <div className="section-heading section-heading-actions">
          <div>
            <h2 id="history-title">Measurement history</h2>
            <p>Select a metric and date range to inspect the recorded history.</p>
          </div>
          {metrics.some((metric) => metric.source === "MOCK") && (
            <span className="badge badge-warning">Includes demo data</span>
          )}
        </div>

        <div className="health-filter-bar">
          <label className="field health-metric-select">
            <span>Metric</span>
            <select
              value={metricType}
              onChange={(event) => setMetricType(event.target.value as HealthMetricType)}
            >
              {healthMetricTypes.map((type) => (
                <option value={type} key={type}>
                  {healthMetricPresentation[type].label}
                </option>
              ))}
            </select>
          </label>

          <div className="health-range-control" role="group" aria-label="History date range">
            {([
              ["TODAY", "Today"],
              ["SEVEN_DAYS", "7 days"],
              ["THIRTY_DAYS", "30 days"],
              ["CUSTOM", "Custom"],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                className={`range-button${preset === value ? " is-selected" : ""}`}
                aria-pressed={preset === value}
                onClick={() => setPreset(value)}
                key={value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {preset === "CUSTOM" && (
          <div className="custom-date-range">
            <label className="field">
              <span>From</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || today}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>
            <label className="field">
              <span>To</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={today}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>
          </div>
        )}

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
            <button className="button button-ghost button-small" onClick={() => void loadHistory()}>
              Try again
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="health-history-state" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p>Loading {presentation.label.toLowerCase()} history…</p>
          </div>
        ) : !error && metrics.length === 0 ? (
          <div className="health-history-state empty-state">
            <span className="state-icon" aria-hidden="true">⌁</span>
            <h3>No {presentation.label.toLowerCase()} readings</h3>
            <p>There are no synchronized readings in this date range. Connect and sync a device from the Wearables page.</p>
          </div>
        ) : !error ? (
          <>
            <HealthMetricChart metrics={sortedMetrics} metricType={metricType} />

            <div className="history-table-heading">
              <div>
                <h3>Recorded readings</h3>
                <p>
                  {newestFirst.length > 50
                    ? `Showing the latest 50 of ${newestFirst.length} loaded readings.`
                    : `${newestFirst.length} loaded ${newestFirst.length === 1 ? "reading" : "readings"}.`}
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table health-history-table">
                <thead>
                  <tr>
                    <th scope="col">Measured</th>
                    <th scope="col">Value</th>
                    <th scope="col">Source</th>
                    <th scope="col">Data type</th>
                  </tr>
                </thead>
                <tbody>
                  {newestFirst.slice(0, 50).map((metric) => (
                    <tr key={metric.id}>
                      <td>{new Date(metric.measuredAt).toLocaleString()}</td>
                      <td><strong>{formatMetricValue(metric)}</strong></td>
                      <td>{sourceLabel(metric.source)}</td>
                      <td>
                        {metric.source === "MOCK" ? (
                          <span className="badge badge-warning">Demo / mock</span>
                        ) : (
                          <span className="badge badge-info">Recorded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <div className="health-management-grid">
        <HealthAlertsPanel />
        <AlertRulesPanel />
      </div>
    </main>
  );
}
