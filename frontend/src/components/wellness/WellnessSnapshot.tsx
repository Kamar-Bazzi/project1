import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { wellnessService } from "../../services/patient-health.service";
import {
  wellnessIndicatorKeys,
  type WellnessDashboard,
  type WellnessIndicator,
  type WellnessIndicatorKey,
  type WellnessIndicatorState,
} from "../../types/patient-health";

const indicatorPresentation: Record<
  WellnessIndicatorKey,
  { label: string; icon: string }
> = {
  MEDICATION_ADHERENCE: { label: "Medication routine", icon: "Rx" },
  ACTIVITY: { label: "Activity", icon: "S" },
  SLEEP: { label: "Sleep", icon: "Zz" },
  HEART_RATE: { label: "Heart rate", icon: "♥" },
  MEASUREMENTS: { label: "Measurements", icon: "M" },
  ALERTS: { label: "Alerts", icon: "!" },
};

const stateLabels: Record<WellnessIndicatorState, string> = {
  ON_TRACK: "On track",
  REVIEW: "Worth reviewing",
  NEEDS_DATA: "Needs data",
};

function fallbackIndicator(key: WellnessIndicatorKey): WellnessIndicator {
  return {
    key,
    score: null,
    status: "NEEDS_DATA",
    value: null,
    unit: null,
    dataPoints: 0,
    scoringBasis: "No recent records were available for this indicator.",
    summary: "Add recent records to include this area in your snapshot.",
  };
}

function scoreLabel(score: number | null): string {
  return score === null ? "—" : String(Math.round(score));
}

function formattedGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "recent records"
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function WellnessSnapshot() {
  const [summary, setSummary] = useState<WellnessDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      setSummary(await wellnessService.summary());
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "We could not build your wellness snapshot right now.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className="card wellness-snapshot"
      aria-labelledby="wellness-snapshot-title"
    >
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">Wellness snapshot</p>
          <h2 id="wellness-snapshot-title">Your recent health routine at a glance</h2>
          <p>
            Simple indicators summarize recorded activity. They do not assess,
            diagnose, or predict a medical condition.
          </p>
        </div>
        {summary && (
          <span className="wellness-period">
            Last {summary.period.days} days
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="wellness-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Building your wellness snapshot…</p>
        </div>
      ) : error ? (
        <div className="wellness-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <h3>Snapshot unavailable</h3>
          <p>{error}</p>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      ) : summary ? (
        <>
          <div className="wellness-overview">
            <div className={`wellness-score status-${summary.overall.status.toLowerCase().replace(/_/g, "-")}`}>
              <span>Wellness score</span>
              <strong>{scoreLabel(summary.overall.score)}</strong>
              <small>{summary.overall.score === null ? "Not enough data" : "out of 100"}</small>
            </div>
            <div className="wellness-overview-copy">
              <span className={`badge wellness-status status-${summary.overall.status.toLowerCase().replace(/_/g, "-")}`}>
                {stateLabels[summary.overall.status]}
              </span>
              <h3>Built only from your recorded data</h3>
              <p>
                {summary.overall.availableComponents} of {summary.overall.totalComponents}{" "}
                indicators had enough recent data. Missing data does not lower your score.
              </p>
              {summary.overall.score !== null && (
                <progress
                  className="wellness-progress"
                  max={100}
                  value={summary.overall.score}
                  aria-label={`Wellness score ${Math.round(summary.overall.score)} out of 100`}
                />
              )}
              <small>Updated {formattedGeneratedAt(summary.generatedAt)}</small>
            </div>
          </div>

          <div className="wellness-indicator-grid">
            {wellnessIndicatorKeys.map((key) => {
              const indicator =
                summary.components.find((item) => item.key === key) ??
                fallbackIndicator(key);
              const presentation = indicatorPresentation[key];
              const stateClass = indicator.status.toLowerCase().replace(/_/g, "-");

              return (
                <article className={`wellness-indicator status-${stateClass}`} key={key}>
                  <div className="wellness-indicator-heading">
                    <span className="wellness-indicator-icon" aria-hidden="true">
                      {presentation.icon}
                    </span>
                    <div>
                      <h3>{presentation.label}</h3>
                      <span className={`badge wellness-status status-${stateClass}`}>
                        {stateLabels[indicator.status]}
                      </span>
                    </div>
                    <strong>{indicator.score === null ? "—" : Math.round(indicator.score)}</strong>
                  </div>
                  <p>{indicator.summary}</p>
                  <details>
                    <summary>How this was summarized</summary>
                    <p>{indicator.scoringBasis}</p>
                    <small>
                      {indicator.dataPoints} recorded data point{indicator.dataPoints === 1 ? "" : "s"}
                    </small>
                  </details>
                </article>
              );
            })}
          </div>

          <p className="health-safety-note wellness-disclaimer">
            <strong>Informational only.</strong> {summary.disclaimer}
          </p>
        </>
      ) : null}
    </section>
  );
}
