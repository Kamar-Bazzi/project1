import { type FormEvent, useMemo, useState } from "react";
import { useMedications } from "../services/use-medications";
import {
  formatMedicationDoseTime,
  formatEnumLabel,
  getTodaysMedicationLogs,
  medicationLogStatuses,
  medicationStatuses,
  type Medication,
  type MedicationInput,
  type MedicationLogStatus,
  type MedicationStatus,
} from "../types/medication";

type MedicationStatusFilter = "ALL" | MedicationStatus;
type MedicationLogStatusFilter = "ALL" | MedicationLogStatus;

interface MedicationDraft {
  name: string;
  dosage: string;
  instructions: string;
  startDate: string;
  endDate: string;
  schedules: Array<{ scheduledTime: string }>;
}

function todayForDateInput(): string {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function createEmptyDraft(): MedicationDraft {
  return {
    name: "",
    dosage: "",
    instructions: "",
    startDate: todayForDateInput(),
    endDate: "",
    schedules: [{ scheduledTime: "08:00" }],
  };
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function draftFromMedication(medication: Medication): MedicationDraft {
  return {
    name: medication.name,
    dosage: medication.dosage,
    instructions: medication.instructions ?? "",
    startDate: toDateInput(medication.startDate),
    endDate: toDateInput(medication.endDate),
    schedules: medication.schedules.map(({ scheduledTime }) => ({
      scheduledTime,
    })),
  };
}

function formatDate(value: string | null): string {
  if (!value) return "Ongoing";
  const dateKey = value.slice(0, 10);
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function MedicationsPage() {
  const {
    medications,
    isLoading,
    error,
    actionError,
    mutationKey,
    refresh,
    clearActionError,
    addMedication,
    updateMedication,
    deleteMedication,
    updateMedicationLogStatus,
  } = useMedications();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<MedicationStatusFilter>("ALL");
  const [doseStatusFilter, setDoseStatusFilter] =
    useState<MedicationLogStatusFilter>("ALL");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MedicationDraft>(createEmptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const todaysLogs = useMemo(
    () => medications.flatMap((medication) => getTodaysMedicationLogs(medication)),
    [medications],
  );
  const activeMedications = medications.filter(
    (medication) => medication.status === "ACTIVE",
  ).length;
  const takenToday = todaysLogs.filter((log) => log.status === "TAKEN").length;
  const attentionToday = todaysLogs.filter(
    (log) => log.status === "MISSED" || log.status === "SKIPPED",
  ).length;

  const filteredMedications = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return medications.filter((medication) => {
      const medicationLogs = getTodaysMedicationLogs(medication);
      const matchesSearch =
        !normalizedSearch ||
        medication.name.toLowerCase().includes(normalizedSearch) ||
        medication.dosage.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "ALL" || medication.status === statusFilter;
      const matchesDoseStatus =
        doseStatusFilter === "ALL" ||
        medicationLogs.some((log) => log.status === doseStatusFilter);

      return matchesSearch && matchesStatus && matchesDoseStatus;
    });
  }, [doseStatusFilter, medications, searchTerm, statusFilter]);

  function openCreateForm(): void {
    setEditingId(null);
    setDraft(createEmptyDraft());
    setFormError(null);
    setSuccessMessage(null);
    clearActionError();
    setIsFormOpen(true);
  }

  function openEditForm(medication: Medication): void {
    setEditingId(medication.id);
    setDraft(draftFromMedication(medication));
    setFormError(null);
    setSuccessMessage(null);
    clearActionError();
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm(): void {
    setIsFormOpen(false);
    setEditingId(null);
    setDraft(createEmptyDraft());
    setFormError(null);
    clearActionError();
  }

  function updateSchedule(index: number, value: string): void {
    setDraft((current) => ({
      ...current,
      schedules: current.schedules.map((schedule, scheduleIndex) =>
        scheduleIndex === index
          ? { ...schedule, scheduledTime: value }
          : schedule,
      ),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    clearActionError();

    if (!draft.name.trim() || !draft.dosage.trim() || !draft.startDate) {
      setFormError("Name, dosage, and start date are required.");
      return;
    }

    if (draft.endDate && draft.endDate < draft.startDate) {
      setFormError("End date cannot be before the start date.");
      return;
    }

    if (
      draft.schedules.length === 0 ||
      draft.schedules.some((schedule) => !schedule.scheduledTime)
    ) {
      setFormError("Every daily schedule needs a time.");
      return;
    }

    if (new Set(draft.schedules.map((schedule) => schedule.scheduledTime)).size !== draft.schedules.length) {
      setFormError("Each medication schedule must use a unique time.");
      return;
    }

    const input: MedicationInput = {
      name: draft.name.trim(),
      dosage: draft.dosage.trim(),
      instructions: draft.instructions.trim() || null,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      schedules: draft.schedules.map((schedule) => ({
        scheduledTime: schedule.scheduledTime,
        frequency: "DAILY",
      })),
    };

    const succeeded = editingId
      ? await updateMedication(editingId, input)
      : await addMedication(input);

    if (succeeded) {
      const message = editingId ? "Medication updated." : "Medication added.";
      closeForm();
      setSuccessMessage(message);
    }
  }

  async function handleDelete(medication: Medication): Promise<void> {
    const shouldDelete = window.confirm(
      `Delete ${medication.name}? Its schedules and dose history will also be removed.`,
    );

    if (!shouldDelete) return;

    setSuccessMessage(null);
    const succeeded = await deleteMedication(medication.id);
    if (succeeded) setSuccessMessage("Medication deleted.");
  }

  return (
    <main className="page-shell">
      <header className="page-heading page-heading-actions">
        <div>
          <p className="eyebrow">Treatment plan</p>
          <h1>Medications</h1>
          <p>Manage prescriptions and record every scheduled dose.</p>
        </div>
        <button className="button button-primary" type="button" onClick={openCreateForm}>
          <span aria-hidden="true">＋</span> Add medication
        </button>
      </header>

      {isFormOpen && (
        <section className="card form-card page-form" aria-labelledby="medication-form-title">
          <div className="section-heading section-heading-actions">
            <div>
              <h2 id="medication-form-title">
                {editingId ? "Edit medication" : "Add a medication"}
              </h2>
              <p>Enter the prescription details and daily schedule.</p>
            </div>
            <button className="icon-button" type="button" onClick={closeForm} aria-label="Close form">×</button>
          </div>

          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          {actionError && <div className="alert alert-error" role="alert">{actionError}</div>}

          <form className="form-stack" onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <label className="field">
                <span>Medication name</span>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  disabled={mutationKey !== null}
                  maxLength={100}
                  placeholder="e.g. Metformin"
                  required
                />
              </label>
              <label className="field">
                <span>Dosage</span>
                <input
                  value={draft.dosage}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, dosage: event.target.value }))
                  }
                  disabled={mutationKey !== null}
                  maxLength={100}
                  placeholder="e.g. 500 mg"
                  required
                />
              </label>
              <label className="field">
                <span>Start date</span>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, startDate: event.target.value }))
                  }
                  disabled={mutationKey !== null}
                  required
                />
              </label>
              <label className="field">
                <span>End date</span>
                <input
                  type="date"
                  min={draft.startDate}
                  value={draft.endDate}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, endDate: event.target.value }))
                  }
                  disabled={mutationKey !== null}
                />
              </label>
              <label className="field field-wide">
                <span>Instructions</span>
                <textarea
                  value={draft.instructions}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      instructions: event.target.value,
                    }))
                  }
                  disabled={mutationKey !== null}
                  maxLength={1000}
                  rows={3}
                  placeholder="e.g. Take with food"
                />
              </label>
            </div>

            <fieldset className="schedule-fieldset">
              <div className="fieldset-heading">
                <div>
                  <legend>Daily dose times</legend>
                  <p>Add up to eight unique times. Each schedule repeats daily.</p>
                </div>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  disabled={mutationKey !== null || draft.schedules.length >= 8}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      schedules: [
                        ...current.schedules,
                        { scheduledTime: "12:00" },
                      ],
                    }))
                  }
                >
                  ＋ Add time
                </button>
              </div>

              <div className="schedule-list">
                {draft.schedules.map((schedule, index) => (
                  <div className="schedule-row" key={`${index}-${draft.schedules.length}`}>
                    <label className="field">
                      <span>Time {index + 1}</span>
                      <input
                        type="time"
                        value={schedule.scheduledTime}
                        disabled={mutationKey !== null}
                        onChange={(event) =>
                          updateSchedule(index, event.target.value)
                        }
                        required
                      />
                    </label>
                    <button
                      className="icon-button icon-button-danger schedule-remove"
                      type="button"
                      aria-label={`Remove schedule ${index + 1}`}
                      disabled={mutationKey !== null || draft.schedules.length === 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          schedules: current.schedules.filter(
                            (_, scheduleIndex) => scheduleIndex !== index,
                          ),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={mutationKey !== null}>
                {mutationKey ? "Saving…" : editingId ? "Save changes" : "Add medication"}
              </button>
              <button className="button button-secondary" type="button" disabled={mutationKey !== null} onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {successMessage && <div className="alert alert-success" role="status">{successMessage}</div>}
      {!isFormOpen && actionError && <div className="alert alert-error" role="alert">{actionError}</div>}

      <section className="summary-grid" aria-label="Medication summary">
        <article className="summary-card">
          <span className="summary-icon summary-icon-blue" aria-hidden="true">Rx</span>
          <div><p>Total medications</p><strong>{medications.length}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-teal" aria-hidden="true">✓</span>
          <div><p>Active</p><strong>{activeMedications}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-violet" aria-hidden="true">●</span>
          <div><p>Taken today</p><strong>{takenToday}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-amber" aria-hidden="true">!</span>
          <div><p>Missed or skipped</p><strong>{attentionToday}</strong></div>
        </article>
      </section>

      <section className="card filter-bar" aria-label="Medication filters">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search medications</span>
          <input
            type="search"
            placeholder="Search medication or dosage"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <label className="compact-field">
          <span className="sr-only">Filter lifecycle status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as MedicationStatusFilter)
            }
          >
            <option value="ALL">All lifecycle statuses</option>
            {medicationStatuses.map((status) => (
              <option key={status} value={status}>{formatEnumLabel(status)}</option>
            ))}
          </select>
        </label>
        <label className="compact-field">
          <span className="sr-only">Filter today&apos;s dose status</span>
          <select
            value={doseStatusFilter}
            onChange={(event) =>
              setDoseStatusFilter(event.target.value as MedicationLogStatusFilter)
            }
          >
            <option value="ALL">All dose statuses</option>
            {medicationLogStatuses.map((status) => (
              <option key={status} value={status}>{formatEnumLabel(status)}</option>
            ))}
          </select>
        </label>
      </section>

      {isLoading ? (
        <section className="state-card" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <h2>Loading medications</h2>
          <p>We&apos;re retrieving your current treatment plan.</p>
        </section>
      ) : error ? (
        <section className="state-card" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <h2>Medications unavailable</h2>
          <p>{error}</p>
          <button className="button button-primary" onClick={() => void refresh()}>
            Try again
          </button>
        </section>
      ) : medications.length === 0 ? (
        <section className="state-card empty-state">
          <span className="state-icon" aria-hidden="true">Rx</span>
          <h2>No medications yet</h2>
          <p>Add your first prescription to start tracking scheduled doses.</p>
          <button className="button button-primary" onClick={openCreateForm}>
            Add first medication
          </button>
        </section>
      ) : filteredMedications.length === 0 ? (
        <section className="state-card empty-state">
          <h2>No matching medications</h2>
          <p>Adjust the search or filters to see more results.</p>
          <button
            className="button button-secondary"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("ALL");
              setDoseStatusFilter("ALL");
            }}
          >
            Clear filters
          </button>
        </section>
      ) : (
        <section className="medication-list" aria-label="Medication list">
          {filteredMedications.map((medication) => {
            const medicationLogs = getTodaysMedicationLogs(medication);
            const isMedicationBusy = mutationKey === `medication:${medication.id}`;

            return (
              <article className="card medication-record" key={medication.id}>
                <div className="medication-record-main">
                  <div className="medication-title-row">
                    <div>
                      <div className="badge-row">
                        <span className={`badge badge-${medication.status.toLowerCase()}`}>
                          {formatEnumLabel(medication.status)}
                        </span>
                      </div>
                      <h2>{medication.name}</h2>
                      <p className="medication-dose">{medication.dosage}</p>
                    </div>
                    <div className="row-actions">
                      <button className="button button-ghost button-small" type="button" disabled={mutationKey !== null} onClick={() => openEditForm(medication)}>
                        Edit
                      </button>
                      <button className="button button-danger-ghost button-small" type="button" disabled={mutationKey !== null} onClick={() => void handleDelete(medication)}>
                        {isMedicationBusy ? "Working…" : "Delete"}
                      </button>
                    </div>
                  </div>

                  <dl className="detail-grid">
                    <div>
                      <dt>Schedule</dt>
                      <dd>
                        {medication.schedules.map((schedule) => (
                          <span className="schedule-chip" key={schedule.id}>
                            {schedule.scheduledTime}
                          </span>
                        ))}
                      </dd>
                    </div>
                    <div>
                      <dt>Treatment dates</dt>
                      <dd>{formatDate(medication.startDate)} – {formatDate(medication.endDate)}</dd>
                    </div>
                    <div className="detail-wide">
                      <dt>Instructions</dt>
                      <dd>{medication.instructions || "No special instructions"}</dd>
                    </div>
                  </dl>

                  <label className="lifecycle-control">
                    <span>Lifecycle status</span>
                    <select
                      value={medication.status}
                      disabled={mutationKey !== null}
                      onChange={(event) =>
                        void updateMedication(medication.id, {
                          status: event.target.value as MedicationStatus,
                        })
                      }
                    >
                      {medicationStatuses
                        .filter(
                          (status) =>
                            medication.status === "ACTIVE" || status !== "ACTIVE",
                        )
                        .map((status) => (
                          <option key={status} value={status}>{formatEnumLabel(status)}</option>
                        ))}
                    </select>
                  </label>
                </div>

                <div className="dose-panel">
                  <div className="dose-panel-heading">
                    <div>
                      <p className="eyebrow">Today</p>
                      <h3>Scheduled doses</h3>
                    </div>
                    <span className="dose-count">{medicationLogs.length}</span>
                  </div>

                  {medicationLogs.length === 0 ? (
                    <p className="muted-message">No dose logs are scheduled for today.</p>
                  ) : (
                    <div className="dose-list">
                      {medicationLogs.map((log) => (
                        <div className="dose-row" key={log.id}>
                          <div className="dose-row-heading">
                            <strong>
                              {formatMedicationDoseTime(
                                log.scheduledFor,
                                medication.timeZone,
                              )}
                            </strong>
                            <span className={`badge badge-${log.status.toLowerCase()}`}>
                              {formatEnumLabel(log.status)}
                            </span>
                          </div>
                          <div
                            className="dose-actions"
                            aria-label={`Set ${formatMedicationDoseTime(
                              log.scheduledFor,
                              medication.timeZone,
                            )} dose status`}
                          >
                            {medicationLogStatuses.map((status) => (
                              <button
                                key={status}
                                type="button"
                                className={`dose-action dose-action-${status.toLowerCase()}${log.status === status ? " is-selected" : ""}`}
                                disabled={mutationKey !== null || log.status === status}
                                onClick={() =>
                                  void updateMedicationLogStatus(
                                    medication.id,
                                    log.id,
                                    status,
                                  )
                                }
                              >
                                {mutationKey === `log:${log.id}` ? "Saving…" : formatEnumLabel(status)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
