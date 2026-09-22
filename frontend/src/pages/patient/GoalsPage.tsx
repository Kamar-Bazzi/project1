import { type FormEvent, useCallback, useEffect, useState } from "react";

import { getApiErrorMessage } from "../../services/api-error";
import { careService } from "../../services/care.service";
import type {
  HealthGoal,
  HealthGoalDirection,
  HealthGoalType,
} from "../../types/care";
import {
  formatGoalMetric,
  goalCurrentValue,
  goalProgress,
} from "../../utils/health-goal-utils";

const MAX_GOAL_VALUE = 1_000_000;

const trackableGoalTypes = [
  "DAILY_STEPS",
  "SLEEP_DURATION",
  "MEDICATION_ADHERENCE",
  "DAILY_ACTIVITY_MINUTES",
  "WEIGHT",
] as const satisfies readonly HealthGoalType[];

const goalUnits: Record<HealthGoalType, string> = {
  WEIGHT: "kg",
  DAILY_STEPS: "steps",
  DAILY_ACTIVITY_MINUTES: "minutes",
  HEART_RATE: "bpm",
  BLOOD_PRESSURE: "mmHg",
  BLOOD_GLUCOSE: "mg/dL",
  OXYGEN_SATURATION: "%",
  SLEEP_DURATION: "hours",
  MEDICATION_ADHERENCE: "%",
};

const goalTrackingHelp: Record<(typeof trackableGoalTypes)[number], string> = {
  DAILY_STEPS: "Can update from the latest steps synced today.",
  SLEEP_DURATION: "Can update from your latest synced sleep duration.",
  MEDICATION_ADHERENCE:
    "Can update from doses you mark taken, missed, or skipped today.",
  DAILY_ACTIVITY_MINUTES:
    "Can update from exercise minutes in today's check-in.",
  WEIGHT: "Can update from your latest recorded or synced weight.",
};

function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value);
}

function targetText(goal: HealthGoal): string {
  if (goal.direction === "BETWEEN") {
    return `${formatNumber(goal.targetValue)}–${formatNumber(
      goal.targetSecondaryValue ?? goal.targetValue,
    )} ${goal.unit}`;
  }
  return `${formatGoalMetric(goal.direction)} ${formatNumber(
    goal.targetValue,
  )} ${goal.unit}`;
}

function progressText(goal: HealthGoal): string {
  const progress = goal.currentProgress;
  const current = goalCurrentValue(goal);
  if (current === null) return "No progress recorded";
  const secondary =
    progress?.secondaryValue === null || progress?.secondaryValue === undefined
      ? ""
      : `/${formatNumber(progress.secondaryValue)}`;
  return `Latest: ${formatNumber(current)}${secondary} ${goal.unit}`;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<HealthGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [metric, setMetric] = useState<HealthGoalType>("DAILY_STEPS");
  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<HealthGoalDirection>("AT_LEAST");
  const [targetValue, setTargetValue] = useState("");
  const [targetSecondaryValue, setTargetSecondaryValue] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [progressGoalId, setProgressGoalId] = useState<string | null>(null);
  const [progressValue, setProgressValue] = useState("");
  const [progressSecondaryValue, setProgressSecondaryValue] = useState("");
  const [progressNote, setProgressNote] = useState("");

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      setGoals(await careService.listGoals());
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "We could not load your health goals.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetGoalForm(): void {
    setMetric("DAILY_STEPS");
    setTitle("");
    setDirection("AT_LEAST");
    setTargetValue("");
    setTargetSecondaryValue("");
    setTargetDate("");
  }

  async function createGoal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const target = Number(targetValue);
    const secondary =
      targetSecondaryValue.trim() === "" ? null : Number(targetSecondaryValue);
    const needsSecondary = direction === "BETWEEN";

    if (title.trim().length < 2) {
      setError("Enter a goal title with at least two characters.");
      return;
    }
    if (
      targetValue.trim() === "" ||
      !Number.isFinite(target) ||
      target <= 0 ||
      target > MAX_GOAL_VALUE
    ) {
      setError("Enter a target greater than zero.");
      return;
    }
    if (
      needsSecondary &&
      (secondary === null ||
        !Number.isFinite(secondary) ||
        secondary <= target ||
        secondary > MAX_GOAL_VALUE)
    ) {
      setError("Enter a range maximum greater than the minimum.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const created = await careService.createGoal({
        title: title.trim(),
        metric,
        direction,
        targetValue: target,
        targetSecondaryValue: needsSecondary ? secondary : null,
        unit: goalUnits[metric],
        startDate: new Date().toISOString(),
        targetDate: targetDate
          ? new Date(`${targetDate}T23:59:59`).toISOString()
          : null,
      });
      setGoals((current) => [created, ...current]);
      setShowForm(false);
      resetGoalForm();
      setMessage("Health goal created.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not create this goal."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function recordProgress(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const goal = goals.find((item) => item.id === progressGoalId);
    const value = Number(progressValue);
    const secondary =
      progressSecondaryValue.trim() === ""
        ? null
        : Number(progressSecondaryValue);

    if (
      !goal ||
      progressValue.trim() === "" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > MAX_GOAL_VALUE
    ) {
      setError("Enter a valid progress value.");
      return;
    }
    if (
      goal.metric === "BLOOD_PRESSURE" &&
      (secondary === null ||
        !Number.isFinite(secondary) ||
        secondary < 0 ||
        secondary > MAX_GOAL_VALUE)
    ) {
      setError("Enter both blood-pressure values.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      await careService.recordGoalProgress(goal.id, {
        value,
        secondaryValue: secondary,
        note: progressNote.trim() || null,
        recordedAt: new Date().toISOString(),
      });
      await load();
      setProgressGoalId(null);
      setProgressValue("");
      setProgressSecondaryValue("");
      setProgressNote("");
      setMessage("Progress recorded.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not record progress."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus(
    goal: HealthGoal,
    status: "PAUSED" | "ACTIVE" | "CANCELLED",
  ): Promise<void> {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await careService.updateGoal(goal.id, { status });
      setGoals((current) =>
        current.map((item) => (item.id === goal.id ? updated : item)),
      );
      setMessage(`Goal ${status.toLowerCase()}.`);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not update this goal."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="page-shell page-shell-narrow">
      <header className="page-heading page-heading-actions">
        <div>
          <p className="eyebrow">Personal targets</p>
          <h1>Health goals</h1>
          <p>
            Track daily steps, sleep, medication adherence, exercise minutes,
            and weight targets using records you choose to save.
          </p>
        </div>
        <button
          type="button"
          className="button button-primary"
          aria-expanded={showForm}
          aria-controls="new-health-goal"
          onClick={() => {
            setShowForm((current) => !current);
            setError(null);
            setMessage(null);
          }}
        >
          {showForm ? "Close form" : "Create a goal"}
        </button>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      )}

      {showForm && (
        <section id="new-health-goal" className="card form-card page-form">
          <div className="section-heading">
            <p className="eyebrow">New goal</p>
            <h2>Define your target</h2>
            <p>
              These are personal tracking targets. Set them with a clinician
              when appropriate for you.
            </p>
          </div>
          <form className="form-stack" onSubmit={createGoal} noValidate>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Goal type</span>
                <select
                  aria-label="Goal type"
                  aria-describedby="goal-type-help"
                  value={metric}
                  onChange={(event) => {
                    setMetric(event.target.value as HealthGoalType);
                    setError(null);
                  }}
                  disabled={isSaving}
                >
                  {trackableGoalTypes.map((value) => (
                    <option key={value} value={value}>
                      {formatGoalMetric(value)}
                    </option>
                  ))}
                </select>
                <small id="goal-type-help" className="field-help">
                  {goalTrackingHelp[
                    metric as (typeof trackableGoalTypes)[number]
                  ] ?? "You can record progress manually."}
                </small>
              </label>
              <label className="field">
                <span>Title</span>
                <input
                  value={title}
                  minLength={2}
                  maxLength={160}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Walk more each day"
                  disabled={isSaving}
                  required
                />
              </label>
              <label className="field">
                <span>Target direction</span>
                <select
                  value={direction}
                  onChange={(event) => {
                    const next = event.target.value as HealthGoalDirection;
                    setDirection(next);
                    if (next !== "BETWEEN") setTargetSecondaryValue("");
                  }}
                  disabled={isSaving}
                >
                  <option value="AT_LEAST">At least</option>
                  <option value="AT_MOST">At most</option>
                  <option value="BETWEEN">Within a range</option>
                </select>
              </label>
              <label className="field">
                <span>
                  {direction === "BETWEEN" ? "Minimum" : "Target"} (
                  {goalUnits[metric]})
                </span>
                <input
                  type="number"
                  min="0.000001"
                  max={MAX_GOAL_VALUE}
                  step="any"
                  value={targetValue}
                  onChange={(event) => setTargetValue(event.target.value)}
                  disabled={isSaving}
                  required
                />
              </label>
              {direction === "BETWEEN" && (
                <label className="field">
                  <span>Maximum ({goalUnits[metric]})</span>
                  <input
                    type="number"
                    min="0.000001"
                    max={MAX_GOAL_VALUE}
                    step="any"
                    value={targetSecondaryValue}
                    onChange={(event) =>
                      setTargetSecondaryValue(event.target.value)
                    }
                    disabled={isSaving}
                    required
                  />
                </label>
              )}
              <label className="field">
                <span>
                  Target date <small>(optional)</small>
                </span>
                <input
                  type="date"
                  value={targetDate}
                  min={localDateKey()}
                  onChange={(event) => setTargetDate(event.target.value)}
                  disabled={isSaving}
                />
              </label>
            </div>
            <button
              className="button button-primary"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Creating…" : "Create goal"}
            </button>
          </form>
        </section>
      )}

      <section className="goal-page-list" aria-label="Health goals">
        {isLoading ? (
          <div className="card state-card" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p>Loading goals…</p>
          </div>
        ) : goals.length === 0 ? (
          <div className="card state-card">
            <span className="state-icon" aria-hidden="true">
              ◎
            </span>
            <h2>No health goals yet</h2>
            <p>Create a personal goal to start tracking recorded progress.</p>
          </div>
        ) : (
          goals.map((goal) => {
            const progress = goalProgress(goal);
            const current = goalCurrentValue(goal);
            const roundedProgress = Math.round(progress);
            const targetReached = progress >= 100;
            const currentProgress = goal.currentProgress;

            return (
              <article
                className={`card goal-detail-card${
                  goal.status === "ACTIVE" ? "" : " is-inactive"
                }`}
                key={goal.id}
              >
                <div className="goal-detail-heading">
                  <div>
                    <div className="badge-row">
                      <span
                        className={`badge badge-${goal.status.toLowerCase()}`}
                      >
                        {formatGoalMetric(goal.status)}
                      </span>
                      <span className="badge badge-info">
                        {formatGoalMetric(goal.metric)}
                      </span>
                      {targetReached && (
                        <span className="badge badge-active">
                          Target reached
                        </span>
                      )}
                    </div>
                    <h2>{goal.title}</h2>
                    <p>
                      {progressText(goal)} · Target {targetText(goal)}
                    </p>
                    {currentProgress && (
                      <small className="goal-progress-source">
                        {currentProgress.source === "AUTOMATIC"
                          ? `Updated automatically${
                              currentProgress.basis
                                ? ` from ${currentProgress.basis}`
                                : " from a connected record"
                            }`
                          : "Updated from your manual progress entry"}
                      </small>
                    )}
                  </div>
                  <strong
                    className="goal-percent"
                    aria-label={`${roundedProgress} percent progress`}
                  >
                    {roundedProgress}%
                  </strong>
                </div>
                <div
                  className="goal-progress-track goal-progress-large"
                  role="progressbar"
                  aria-label={`${goal.title} progress`}
                  aria-valuetext={
                    targetReached
                      ? "Target reached"
                      : `${roundedProgress} percent`
                  }
                  aria-valuenow={roundedProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p className="goal-achievement-copy">
                  {targetReached
                    ? "The saved records meet the target you set. Keep tracking if it remains useful to you."
                    : current === null
                      ? "Add a progress entry or connected record to begin."
                      : "Progress reflects only the records saved in CareTrack."}
                </p>

                {progressGoalId === goal.id ? (
                  <form
                    className="goal-progress-form"
                    onSubmit={recordProgress}
                    noValidate
                  >
                    <label className="field">
                      <span>Current value ({goal.unit})</span>
                      <input
                        type="number"
                        min="0"
                        max={MAX_GOAL_VALUE}
                        step="any"
                        value={progressValue}
                        onChange={(event) =>
                          setProgressValue(event.target.value)
                        }
                        disabled={isSaving}
                        required
                      />
                    </label>
                    {goal.metric === "BLOOD_PRESSURE" && (
                      <label className="field">
                        <span>Secondary value ({goal.unit})</span>
                        <input
                          type="number"
                          min="0"
                          max={MAX_GOAL_VALUE}
                          step="any"
                          value={progressSecondaryValue}
                          onChange={(event) =>
                            setProgressSecondaryValue(event.target.value)
                          }
                          disabled={isSaving}
                          required
                        />
                      </label>
                    )}
                    <label className="field">
                      <span>
                        Note <small>(optional)</small>
                      </span>
                      <input
                        value={progressNote}
                        maxLength={1_000}
                        onChange={(event) =>
                          setProgressNote(event.target.value)
                        }
                        disabled={isSaving}
                      />
                    </label>
                    <div className="row-actions">
                      <button
                        className="button button-primary button-small"
                        type="submit"
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving…" : "Save progress"}
                      </button>
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        onClick={() => setProgressGoalId(null)}
                        disabled={isSaving}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="row-actions goal-actions">
                    {goal.status === "ACTIVE" && (
                      <>
                        <button
                          type="button"
                          className="button button-primary button-small"
                          onClick={() => {
                            setProgressGoalId(goal.id);
                            setProgressValue(
                              current === null ? "" : String(current),
                            );
                            setProgressSecondaryValue(
                              currentProgress?.secondaryValue === null ||
                                currentProgress?.secondaryValue === undefined
                                ? ""
                                : String(currentProgress.secondaryValue),
                            );
                            setError(null);
                            setMessage(null);
                          }}
                        >
                          Record progress
                        </button>
                        <button
                          type="button"
                          className="button button-ghost button-small"
                          disabled={isSaving}
                          onClick={() => void updateStatus(goal, "PAUSED")}
                        >
                          Pause
                        </button>
                      </>
                    )}
                    {goal.status === "PAUSED" && (
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        disabled={isSaving}
                        onClick={() => void updateStatus(goal, "ACTIVE")}
                      >
                        Resume
                      </button>
                    )}
                    {goal.status !== "CANCELLED" &&
                      goal.status !== "ACHIEVED" && (
                        <button
                          type="button"
                          className="button button-danger-ghost button-small"
                          disabled={isSaving}
                          onClick={() => void updateStatus(goal, "CANCELLED")}
                        >
                          Cancel goal
                        </button>
                      )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      <p className="health-safety-note">
        <strong>Personal tracking only.</strong> Goal progress is not a medical
        assessment or treatment recommendation.
      </p>
    </main>
  );
}
