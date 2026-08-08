import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { healthAlertService } from "../../services/health-alert.service";
import {
  healthMetricPresentation,
  type HealthAlert,
} from "../../types/health";

interface HealthAlertsPanelProps {
  compact?: boolean;
}

export default function HealthAlertsPanel({ compact = false }: HealthAlertsPanelProps) {
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mutationId, setMutationId] = useState<string | null>(null);

  const loadAlerts = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);
    setError(null);

    try {
      const [active, acknowledged] = await Promise.all([
        healthAlertService.list("ACTIVE"),
        healthAlertService.list("ACKNOWLEDGED"),
      ]);
      setAlerts([...active, ...acknowledged]);
    } catch (loadError) {
      setLoadError(
        getApiErrorMessage(loadError, "We could not load your health alerts."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  async function updateAlert(
    alert: HealthAlert,
    action: "acknowledge" | "resolve",
  ): Promise<void> {
    setMutationId(alert.id);
    setError(null);

    try {
      const updated =
        action === "acknowledge"
          ? await healthAlertService.acknowledge(alert.id)
          : await healthAlertService.resolve(alert.id);
      setAlerts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (updateError) {
      setError(
        getApiErrorMessage(updateError, `We could not ${action} this alert.`),
      );
    } finally {
      setMutationId(null);
    }
  }

  const activeAlerts = alerts
    .filter((alert) => alert.status !== "RESOLVED")
    .sort(
      (left, right) =>
        new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime(),
    );
  const visibleAlerts = compact ? activeAlerts.slice(0, 3) : activeAlerts;

  return (
    <section className={`card health-alerts-panel${compact ? " is-compact" : ""}`} aria-labelledby={compact ? "dashboard-alerts-title" : "health-alerts-title"}>
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">In-app notifications</p>
          <h2 id={compact ? "dashboard-alerts-title" : "health-alerts-title"}>Health alerts</h2>
          <p>Readings outside your configured range appear here for rechecking and attention.</p>
        </div>
        {!isLoading && activeAlerts.length > 0 && (
          <span className="badge badge-warning">{activeAlerts.length} active</span>
        )}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {isLoading ? (
        <div className="compact-loading" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>Loading alerts…</span>
        </div>
      ) : loadError ? (
        <div className="compact-empty-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <div>
            <h3>Health alerts unavailable</h3>
            <p>{loadError}</p>
            <button
              className="button button-secondary button-small"
              onClick={() => void loadAlerts()}
            >
              Try again
            </button>
          </div>
        </div>
      ) : activeAlerts.length === 0 ? (
        <div className="compact-empty-state">
          <span className="state-icon" aria-hidden="true">✓</span>
          <div>
            <h3>No active health alerts</h3>
            <p>Configured rules will notify you after the required consecutive readings.</p>
          </div>
        </div>
      ) : (
        <div className="health-alert-list">
          {visibleAlerts.map((alert) => (
            <article className={`health-alert-item severity-${alert.severity.toLowerCase()}`} key={alert.id}>
              <div className="health-alert-copy">
                <div className="badge-row">
                  <span className={`badge badge-severity-${alert.severity.toLowerCase()}`}>
                    {alert.severity}
                  </span>
                  <span className="badge badge-neutral">
                    {healthMetricPresentation[alert.metricType].label}
                  </span>
                  {alert.status === "ACKNOWLEDGED" && (
                    <span className="badge badge-info">Acknowledged</span>
                  )}
                </div>
                <p>{alert.message}</p>
                <small>{new Date(alert.detectedAt).toLocaleString()}</small>
              </div>
              <div className="row-actions">
                {alert.status === "ACTIVE" && (
                  <button
                    className="button button-secondary button-small"
                    disabled={mutationId === alert.id}
                    onClick={() => void updateAlert(alert, "acknowledge")}
                  >
                    Acknowledge
                  </button>
                )}
                <button
                  className="button button-ghost button-small"
                  disabled={mutationId === alert.id}
                  onClick={() => void updateAlert(alert, "resolve")}
                >
                  Mark resolved
                </button>
              </div>
            </article>
          ))}
          {compact && activeAlerts.length > visibleAlerts.length && (
            <p className="muted-message">More alerts are available on the Health page.</p>
          )}
        </div>
      )}

      <p className="health-safety-note">
        Consumer wearables can be inaccurate. This system does not diagnose medical conditions or contact emergency services.
      </p>
    </section>
  );
}
