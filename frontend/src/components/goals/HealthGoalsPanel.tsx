import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getApiErrorMessage } from "../../services/api-error";
import { careService } from "../../services/care.service";
import type { HealthGoal } from "../../types/care";
import { goalCurrentValue, goalProgress } from "../../utils/health-goal-utils";

function formatValue(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value);
}

function targetValue(goal: HealthGoal): string {
  const secondary =
    goal.targetSecondaryValue === null
      ? ""
      : `–${formatValue(goal.targetSecondaryValue)}`;
  return `${formatValue(goal.targetValue)}${secondary} ${goal.unit}`;
}

function goalStatusText(goal: HealthGoal, reached: boolean): string {
  if (reached) return "Target reached";
  if (goal.remainingDays === null || goal.remainingDays === undefined) {
    return goal.isOnTrack === false ? "Needs attention" : "In progress";
  }
  if (goal.remainingDays < 0) return "Past target date";
  if (goal.remainingDays === 0) return "Due today";
  return `${goal.remainingDays} day${goal.remainingDays === 1 ? "" : "s"} left`;
}

export default function HealthGoalsPanel() {
  const [goals, setGoals] = useState<HealthGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setGoals(await careService.listGoals());
      setError(null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Goals could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeGoals = goals
    .filter((goal) => goal.status === "ACTIVE")
    .slice(0, 3);

  return (
    <section
      className="card health-goals-panel"
      aria-labelledby="dashboard-goals-title"
      aria-busy={isLoading}
    >
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">Progress</p>
          <h2 id="dashboard-goals-title">Health goals</h2>
        </div>
        <Link className="button button-secondary button-small" to="/goals">
          Manage
        </Link>
      </div>

      {error ? (
        <p className="notification-help" role="alert">
          {error}
        </p>
      ) : isLoading ? (
        <p className="notification-help" aria-live="polite">
          Loading goals…
        </p>
      ) : activeGoals.length === 0 ? (
        <div className="compact-empty">
          <span className="state-icon" aria-hidden="true">
            ◎
          </span>
          <div>
            <strong>No active goals</strong>
            <small>Set a personal target and track saved progress.</small>
          </div>
          <Link to="/goals">Create goal</Link>
        </div>
      ) : (
        <div className="compact-goal-list">
          {activeGoals.map((goal) => {
            const progress = goalProgress(goal);
            const roundedProgress = Math.round(progress);
            const current = goalCurrentValue(goal);
            const reached = progress >= 100;
            const statusText = goalStatusText(goal, reached);

            return (
              <article key={goal.id}>
                <div>
                  <span className="goal-icon" aria-hidden="true">
                    ◎
                  </span>
                  <span>
                    <strong>{goal.title}</strong>
                    <small>
                      {current === null
                        ? "No progress yet"
                        : `${formatValue(current)} ${goal.unit}`}{" "}
                      · Target {targetValue(goal)}
                    </small>
                    <small
                      className={[
                        "goal-progress-source",
                        reached || goal.isOnTrack ? "goal-status-good" : "goal-status-warn",
                      ].join(" ")}
                    >
                      {statusText}
                    </small>
                  </span>
                  <b aria-label={reached ? "Target reached" : undefined}>
                    {roundedProgress}%
                  </b>
                </div>
                <div
                  className="goal-progress-track"
                  role="progressbar"
                  aria-label={`${goal.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={roundedProgress}
                  aria-valuetext={
                    reached ? "Target reached" : `${roundedProgress} percent`
                  }
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
