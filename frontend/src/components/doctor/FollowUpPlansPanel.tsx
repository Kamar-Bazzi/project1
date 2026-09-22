import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { doctorFollowUpService } from "../../services/doctor-follow-up.service";
import {
  followUpPlanStatuses,
  type FollowUpPlan,
  type FollowUpPlanStatus,
  type FollowUpTask,
} from "../../types/follow-up-plan";

interface PlanFormState {
  title: string;
  notes: string;
  nextReviewDate: string;
  status: FollowUpPlanStatus;
}

const EMPTY_FORM: PlanFormState = {
  title: "",
  notes: "",
  nextReviewDate: "",
  status: "ACTIVE",
};

function formatDate(value: string | null): string {
  if (!value) return "No review date set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function toDateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function dateInputToIso(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T12:00:00`).toISOString();
}

function enumLabel(value: string): string {
  const normalized = value.replace(/_/g, " ").toLowerCase();
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function planBadgeClass(status: FollowUpPlanStatus): string {
  if (status === "COMPLETED") return "badge-completed";
  if (status === "CANCELLED") return "badge-cancelled";
  return "badge-active";
}

function taskBadgeClass(task: FollowUpTask): string {
  if (task.status === "DONE") return "badge-completed";
  if (task.status === "CANCELLED") return "badge-cancelled";
  return "badge-pending";
}

export default function FollowUpPlansPanel({ patientId }: { patientId: string }) {
  const [plans, setPlans] = useState<FollowUpPlan[]>([]);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPlans = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      setPlans(await doctorFollowUpService.list(patientId));
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Follow-up plans could not be loaded for this assigned patient.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    setPlans([]);
    setForm(EMPTY_FORM);
    setEditingPlanId(null);
    setIsFormOpen(false);
    setTaskDrafts({});
    setMessage(null);
    void loadPlans();
  }, [loadPlans]);

  const orderedPlans = useMemo(
    () =>
      [...plans].sort((first, second) => {
        if (first.status === "ACTIVE" && second.status !== "ACTIVE") return -1;
        if (first.status !== "ACTIVE" && second.status === "ACTIVE") return 1;
        const firstDate = first.nextReviewAt
          ? Date.parse(first.nextReviewAt)
          : Number.POSITIVE_INFINITY;
        const secondDate = second.nextReviewAt
          ? Date.parse(second.nextReviewAt)
          : Number.POSITIVE_INFINITY;
        return firstDate - secondDate;
      }),
    [plans],
  );

  function openCreateForm(): void {
    setEditingPlanId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
    setError(null);
    setMessage(null);
  }

  function beginEdit(plan: FollowUpPlan): void {
    setEditingPlanId(plan.id);
    setForm({
      title: plan.title,
      notes: plan.notes ?? "",
      nextReviewDate: toDateInput(plan.nextReviewAt),
      status: plan.status,
    });
    setIsFormOpen(true);
    setError(null);
    setMessage(null);
    window.setTimeout(() =>
      document
        .getElementById("followup-plan-form")
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }

  function closeForm(): void {
    setEditingPlanId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(false);
  }

  async function savePlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Enter a title for the follow-up plan.");
      return;
    }

    setMutationKey("plan");
    setError(null);
    setMessage(null);
    const input = {
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      nextReviewAt: dateInputToIso(form.nextReviewDate),
      status: form.status,
    };

    try {
      const saved = editingPlanId
        ? await doctorFollowUpService.update(patientId, editingPlanId, input)
        : await doctorFollowUpService.create(patientId, input);
      setPlans((current) => {
        const exists = current.some((plan) => plan.id === saved.id);
        return exists
          ? current.map((plan) => (plan.id === saved.id ? saved : plan))
          : [saved, ...current];
      });
      setMessage(editingPlanId ? "Follow-up plan updated." : "Follow-up plan created.");
      closeForm();
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          editingPlanId
            ? "The follow-up plan could not be updated."
            : "The follow-up plan could not be created.",
        ),
      );
    } finally {
      setMutationKey(null);
    }
  }

  async function addTask(
    event: FormEvent<HTMLFormElement>,
    planId: string,
  ): Promise<void> {
    event.preventDefault();
    const title = taskDrafts[planId]?.trim();
    if (!title) {
      setError("Enter a task before adding it to the plan.");
      return;
    }

    setMutationKey(`task-create:${planId}`);
    setError(null);
    setMessage(null);
    try {
      const created = await doctorFollowUpService.createTask(patientId, planId, {
        title,
      });
      setPlans((current) =>
        current.map((plan) =>
          plan.id === planId
            ? { ...plan, tasks: [...plan.tasks, created] }
            : plan,
        ),
      );
      setTaskDrafts((current) => ({ ...current, [planId]: "" }));
      setMessage("Follow-up task added.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "The follow-up task could not be added."),
      );
    } finally {
      setMutationKey(null);
    }
  }

  async function toggleTask(planId: string, task: FollowUpTask): Promise<void> {
    const status = task.status === "DONE" ? "TODO" : "DONE";
    setMutationKey(`task:${task.id}`);
    setError(null);
    setMessage(null);
    try {
      const updated = await doctorFollowUpService.updateTask(
        patientId,
        planId,
        task.id,
        { status },
      );
      setPlans((current) =>
        current.map((plan) =>
          plan.id === planId
            ? {
                ...plan,
                tasks: plan.tasks.map((candidate) =>
                  candidate.id === updated.id ? updated : candidate,
                ),
              }
            : plan,
        ),
      );
      setMessage(status === "DONE" ? "Task completed." : "Task reopened.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "The follow-up task could not be updated."),
      );
    } finally {
      setMutationKey(null);
    }
  }

  return (
    <section className="doctor-followup-plans followup-plan-panel">
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">Planned follow-up</p>
          <h2>Follow-up plans</h2>
          <p>
            Set the next review and track care-team tasks. Completed visit
            records remain in the immutable follow-up history below.
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => void loadPlans()}
            disabled={isLoading || mutationKey !== null}
          >
            Refresh
          </button>
          <button
            type="button"
            className="button button-primary button-small"
            onClick={isFormOpen && !editingPlanId ? closeForm : openCreateForm}
            disabled={mutationKey !== null}
          >
            {isFormOpen && !editingPlanId ? "Cancel new plan" : "New plan"}
          </button>
        </div>
      </div>

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

      {isFormOpen && (
        <form
          id="followup-plan-form"
          className="clinical-entry-form followup-plan-form"
          onSubmit={savePlan}
        >
          <div className="form-grid">
            <label className="field field-wide">
              <span>Plan title</span>
              <input
                value={form.title}
                maxLength={160}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="For example, review activity and sleep routine"
                disabled={mutationKey !== null}
                required
              />
            </label>
            <label className="field">
              <span>Next review date</span>
              <input
                type="date"
                value={form.nextReviewDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nextReviewDate: event.target.value,
                  }))
                }
                disabled={mutationKey !== null}
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as FollowUpPlanStatus,
                  }))
                }
                disabled={mutationKey !== null}
              >
                {followUpPlanStatuses.map((status) => (
                  <option value={status} key={status}>
                    {enumLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-wide">
              <span>Plan notes</span>
              <textarea
                value={form.notes}
                maxLength={5_000}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Optional goals, context, or review notes"
                disabled={mutationKey !== null}
              />
            </label>
          </div>
          <div className="row-actions">
            {editingPlanId && (
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={closeForm}
                disabled={mutationKey !== null}
              >
                Cancel editing
              </button>
            )}
            <button
              type="submit"
              className="button button-primary button-small"
              disabled={mutationKey !== null}
            >
              {mutationKey === "plan"
                ? "Saving…"
                : editingPlanId
                  ? "Save plan"
                  : "Create plan"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="inline-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading follow-up plans…</p>
        </div>
      ) : orderedPlans.length === 0 ? (
        <div className="inline-state followup-plan-empty">
          <span className="state-icon" aria-hidden="true">
            ✓
          </span>
          <h3>No follow-up plans</h3>
          <p>Create a plan when this patient needs a structured next review.</p>
        </div>
      ) : (
        <div className="followup-plan-list">
          {orderedPlans.map((plan) => (
            <article className="followup-plan-card" key={plan.id}>
              <div className="followup-plan-card-heading">
                <div>
                  <div className="badge-row">
                    <span className={`badge ${planBadgeClass(plan.status)}`}>
                      {enumLabel(plan.status)}
                    </span>
                    <span className="metadata-pill">
                      Review: {formatDate(plan.nextReviewAt)}
                    </span>
                  </div>
                  <h3>{plan.title}</h3>
                  {plan.notes && <p>{plan.notes}</p>}
                </div>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => beginEdit(plan)}
                  disabled={mutationKey !== null}
                >
                  Edit plan
                </button>
              </div>

              <div className="followup-task-section">
                <div className="followup-task-heading">
                  <h4>Tasks</h4>
                  <span>{plan.tasks.length}</span>
                </div>
                {plan.tasks.length === 0 ? (
                  <p className="muted-message">No tasks added to this plan.</p>
                ) : (
                  <ul className="followup-task-list">
                    {plan.tasks.map((task) => (
                      <li
                        className={task.status === "DONE" ? "is-complete" : ""}
                        key={task.id}
                      >
                        <div className="followup-task-copy">
                          <strong>{task.title}</strong>
                          {task.notes && <small>{task.notes}</small>}
                          {task.dueAt && (
                            <small>Due {formatDate(task.dueAt)}</small>
                          )}
                        </div>
                        <div className="row-actions">
                          <span className={`badge ${taskBadgeClass(task)}`}>
                            {enumLabel(task.status)}
                          </span>
                          <button
                            type="button"
                            className="button button-ghost button-small"
                            onClick={() => void toggleTask(plan.id, task)}
                            disabled={
                              mutationKey !== null || plan.status === "CANCELLED"
                            }
                          >
                            {mutationKey === `task:${task.id}`
                              ? "Saving…"
                              : task.status === "DONE"
                                ? "Reopen"
                                : "Mark done"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {plan.status === "ACTIVE" && (
                  <form
                    className="followup-task-form"
                    onSubmit={(event) => void addTask(event, plan.id)}
                  >
                    <label className="field">
                      <span className="sr-only">New task for {plan.title}</span>
                      <input
                        value={taskDrafts[plan.id] ?? ""}
                        maxLength={240}
                        onChange={(event) =>
                          setTaskDrafts((current) => ({
                            ...current,
                            [plan.id]: event.target.value,
                          }))
                        }
                        placeholder="Add a follow-up task"
                        disabled={mutationKey !== null}
                      />
                    </label>
                    <button
                      type="submit"
                      className="button button-secondary button-small"
                      disabled={mutationKey !== null}
                    >
                      {mutationKey === `task-create:${plan.id}`
                        ? "Adding…"
                        : "Add task"}
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
