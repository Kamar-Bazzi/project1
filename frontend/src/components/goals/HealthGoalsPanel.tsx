import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../../services/api-error";
import { careService } from "../../services/care.service";
import type { HealthGoal } from "../../types/care";
import { goalCurrentValue, goalProgress } from "../../utils/health-goal-utils";

export default function HealthGoalsPanel() {
  const [goals, setGoals] = useState<HealthGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try { setGoals(await careService.listGoals()); setError(null); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "Goals could not be loaded.")); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const activeGoals = goals.filter((goal) => goal.status === "ACTIVE").slice(0, 3);

  return <section className="card health-goals-panel"><div className="section-heading section-heading-actions"><div><p className="eyebrow">Progress</p><h2>Health goals</h2></div><Link className="button button-secondary button-small" to="/goals">Manage</Link></div>{error ? <p className="notification-help" role="alert">{error}</p> : isLoading ? <p className="notification-help">Loading goals…</p> : activeGoals.length === 0 ? <div className="compact-empty"><span className="state-icon" aria-hidden="true">◎</span><div><strong>No active goals</strong><small>Set a realistic target and track progress.</small></div><Link to="/goals">Create goal</Link></div> : <div className="compact-goal-list">{activeGoals.map((goal) => { const progress = goalProgress(goal); const current = goalCurrentValue(goal); return <article key={goal.id}><div><span className="goal-icon" aria-hidden="true">◎</span><span><strong>{goal.title}</strong><small>{current === null ? "No progress yet" : `${current} ${goal.unit}`} · Target {goal.targetValue}{goal.targetSecondaryValue !== null ? `–${goal.targetSecondaryValue}` : ""} {goal.unit}</small></span><b>{Math.round(progress)}%</b></div><div className="goal-progress-track" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></div></article>; })}</div>}</section>;
}
