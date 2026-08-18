import { type FormEvent, useCallback, useEffect, useState } from "react";
import { formatGoalMetric, goalCurrentValue, goalProgress } from "../../utils/health-goal-utils";
import { getApiErrorMessage } from "../../services/api-error";
import { careService } from "../../services/care.service";
import {
  healthGoalTypes,
  type HealthGoal,
  type HealthGoalDirection,
  type HealthGoalType,
} from "../../types/care";

const goalUnits: Record<HealthGoalType, string> = {
  WEIGHT: "kg",
  DAILY_STEPS: "steps",
  DAILY_ACTIVITY_MINUTES: "minutes",
  HEART_RATE: "bpm",
  BLOOD_PRESSURE: "mmHg",
  BLOOD_GLUCOSE: "mg/dL",
  OXYGEN_SATURATION: "%",
  SLEEP_DURATION: "minutes",
  MEDICATION_ADHERENCE: "%",
};

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
    setIsLoading(true); setError(null);
    try { setGoals(await careService.listGoals()); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "We could not load your health goals.")); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createGoal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const target = Number(targetValue);
    const secondary = targetSecondaryValue ? Number(targetSecondaryValue) : null;
    if (title.trim().length < 2 || !Number.isFinite(target) || ((direction === "BETWEEN" || metric === "BLOOD_PRESSURE") && (!secondary || (direction === "BETWEEN" && secondary <= target)))) { setError("Enter a title and valid target values. A range maximum must be greater than its minimum."); return; }
    setIsSaving(true); setError(null); setMessage(null);
    try {
      const created = await careService.createGoal({ title: title.trim(), metric, direction, targetValue: target, targetSecondaryValue: direction === "BETWEEN" || metric === "BLOOD_PRESSURE" ? secondary : null, unit: goalUnits[metric], startDate: new Date().toISOString(), targetDate: targetDate ? new Date(`${targetDate}T23:59:59`).toISOString() : null });
      setGoals((current) => [created, ...current]); setShowForm(false); setTitle(""); setTargetValue(""); setTargetSecondaryValue(""); setTargetDate(""); setMessage("Health goal created.");
    } catch (requestError) { setError(getApiErrorMessage(requestError, "We could not create this goal.")); }
    finally { setIsSaving(false); }
  }

  async function recordProgress(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!progressGoalId || !Number.isFinite(Number(progressValue))) { setError("Enter a valid progress value."); return; }
    setIsSaving(true); setError(null); setMessage(null);
    try {
      await careService.recordGoalProgress(progressGoalId, { value: Number(progressValue), secondaryValue: progressSecondaryValue ? Number(progressSecondaryValue) : null, note: progressNote.trim() || null, recordedAt: new Date().toISOString() });
      await load(); setProgressGoalId(null); setProgressValue(""); setProgressSecondaryValue(""); setProgressNote(""); setMessage("Progress recorded.");
    } catch (requestError) { setError(getApiErrorMessage(requestError, "We could not record progress.")); }
    finally { setIsSaving(false); }
  }

  async function updateStatus(goal: HealthGoal, status: "PAUSED" | "ACTIVE" | "CANCELLED"): Promise<void> {
    setIsSaving(true); setError(null);
    try { const updated = await careService.updateGoal(goal.id, { status }); setGoals((current) => current.map((item) => item.id === goal.id ? updated : item)); setMessage(`Goal ${status.toLowerCase()}.`); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "We could not update this goal.")); }
    finally { setIsSaving(false); }
  }

  return <main className="page-shell page-shell-narrow"><header className="page-heading page-heading-actions"><div><p className="eyebrow">Personal targets</p><h1>Health goals</h1><p>Choose measurable goals, record progress, and share a clearer picture with your care team.</p></div><button type="button" className="button button-primary" onClick={() => setShowForm((current) => !current)}>{showForm ? "Close form" : "Create a goal"}</button></header>{error && <div className="alert alert-error" role="alert">{error}</div>}{message && <div className="alert alert-success" role="status">{message}</div>}{showForm && <section className="card form-card page-form"><div className="section-heading"><p className="eyebrow">New goal</p><h2>Define your target</h2><p>Set realistic goals with your clinician when appropriate.</p></div><form className="form-stack" onSubmit={createGoal}><div className="form-grid form-grid-three"><label className="field"><span>Goal type</span><select value={metric} onChange={(event) => { const value = event.target.value as HealthGoalType; setMetric(value); }} disabled={isSaving}>{healthGoalTypes.map((value) => <option key={value} value={value}>{formatGoalMetric(value)}</option>)}</select></label><label className="field"><span>Title</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Walk more each day" disabled={isSaving} /></label><label className="field"><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value as HealthGoalDirection)} disabled={isSaving}><option value="AT_LEAST">At least</option><option value="AT_MOST">At most</option><option value="BETWEEN">Between</option></select></label><label className="field"><span>{direction === "BETWEEN" ? "Minimum" : "Target"} ({goalUnits[metric]})</span><input type="number" step="any" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} disabled={isSaving} /></label>{(direction === "BETWEEN" || metric === "BLOOD_PRESSURE") && <label className="field"><span>{direction === "BETWEEN" ? "Maximum" : "Secondary target"} ({goalUnits[metric]})</span><input type="number" step="any" value={targetSecondaryValue} onChange={(event) => setTargetSecondaryValue(event.target.value)} disabled={isSaving} /></label>}<label className="field"><span>Target date <small>(optional)</small></span><input type="date" value={targetDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setTargetDate(event.target.value)} disabled={isSaving} /></label></div><button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? "Creating…" : "Create goal"}</button></form></section>}<section className="goal-page-list" aria-label="Health goals">{isLoading ? <div className="card state-card"><span className="spinner" aria-hidden="true" /><p>Loading goals…</p></div> : goals.length === 0 ? <div className="card state-card"><span className="state-icon" aria-hidden="true">◎</span><h2>No health goals yet</h2><p>Create a goal to start tracking progress.</p></div> : goals.map((goal) => { const progress = goalProgress(goal); const current = goalCurrentValue(goal); return <article className={`card goal-detail-card${goal.status === "ACTIVE" ? "" : " is-inactive"}`} key={goal.id}><div className="goal-detail-heading"><div><div className="badge-row"><span className={`badge badge-${goal.status.toLowerCase()}`}>{formatGoalMetric(goal.status)}</span><span className="badge badge-info">{formatGoalMetric(goal.metric)}</span></div><h2>{goal.title}</h2><p>{current === null ? "No progress recorded" : `Latest: ${current}${goal.currentProgress?.secondaryValue !== null && goal.currentProgress?.secondaryValue !== undefined ? `/${goal.currentProgress.secondaryValue}` : ""} ${goal.unit}`} · Target {goal.direction === "BETWEEN" ? `${goal.targetValue}–${goal.targetSecondaryValue}` : `${formatGoalMetric(goal.direction)} ${goal.targetValue}`} {goal.unit}</p></div><strong className="goal-percent">{Math.round(progress)}%</strong></div><div className="goal-progress-track goal-progress-large" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>{progressGoalId === goal.id ? <form className="goal-progress-form" onSubmit={recordProgress}><label className="field"><span>Current value</span><input type="number" step="any" value={progressValue} onChange={(event) => setProgressValue(event.target.value)} /></label>{goal.metric === "BLOOD_PRESSURE" && <label className="field"><span>Secondary value</span><input type="number" step="any" value={progressSecondaryValue} onChange={(event) => setProgressSecondaryValue(event.target.value)} /></label>}<label className="field"><span>Note <small>(optional)</small></span><input value={progressNote} maxLength={500} onChange={(event) => setProgressNote(event.target.value)} /></label><div className="row-actions"><button className="button button-primary button-small" type="submit" disabled={isSaving}>Save progress</button><button className="button button-ghost button-small" type="button" onClick={() => setProgressGoalId(null)}>Cancel</button></div></form> : <div className="row-actions goal-actions">{goal.status === "ACTIVE" && <><button type="button" className="button button-primary button-small" onClick={() => { setProgressGoalId(goal.id); setProgressValue(current === null ? "" : String(current)); }}>Record progress</button><button type="button" className="button button-ghost button-small" disabled={isSaving} onClick={() => void updateStatus(goal, "PAUSED")}>Pause</button></>}{goal.status === "PAUSED" && <button type="button" className="button button-secondary button-small" disabled={isSaving} onClick={() => void updateStatus(goal, "ACTIVE")}>Resume</button>}{goal.status !== "CANCELLED" && goal.status !== "ACHIEVED" && <button type="button" className="button button-danger-ghost button-small" disabled={isSaving} onClick={() => void updateStatus(goal, "CANCELLED")}>Cancel goal</button>}</div>}</article>; })}</section></main>;
}
