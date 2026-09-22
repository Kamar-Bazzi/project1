import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { measurementService } from "../../services/measurement.service";
import { medicationService } from "../../services/medication.service";
import { symptomService } from "../../services/patient-health.service";
import { measurementMetadata, type Measurement } from "../../types/measurement";
import type { Medication } from "../../types/medication";
import type { SymptomEntry, SymptomInput } from "../../types/patient-health";

interface SymptomDraft {
  name: string;
  severity: number;
  occurredAt: string;
  notes: string;
  medicationIds: string[];
  measurementIds: string[];
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function emptyDraft(): SymptomDraft {
  return {
    name: "",
    severity: 5,
    occurredAt: toDateTimeLocal(new Date().toISOString()),
    notes: "",
    medicationIds: [],
    measurementIds: [],
  };
}

function draftFromSymptom(symptom: SymptomEntry): SymptomDraft {
  return {
    name: symptom.name,
    severity: symptom.severity,
    occurredAt: toDateTimeLocal(symptom.occurredAt),
    notes: symptom.notes ?? "",
    medicationIds: (symptom.medications ?? []).map((item) => item.id),
    measurementIds: (symptom.measurements ?? []).map((item) => item.id),
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatMeasurement(measurement: Pick<Measurement, "value" | "secondaryValue" | "unit">): string {
  return measurement.secondaryValue === null
    ? `${measurement.value} ${measurement.unit}`
    : `${measurement.value}/${measurement.secondaryValue} ${measurement.unit}`;
}

function severityTone(severity: number): string {
  if (severity >= 8) return "high";
  if (severity >= 4) return "medium";
  return "low";
}

export default function SymptomsPage() {
  const [symptoms, setSymptoms] = useState<SymptomEntry[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SymptomDraft>(emptyDraft);
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const [symptomResult, medicationResult, measurementResult] = await Promise.all([
        symptomService.list(),
        medicationService.list(),
        measurementService.list(),
      ]);
      setSymptoms(symptomResult);
      setMedications(medicationResult);
      setMeasurements(measurementResult);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not load your symptom history."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedSymptoms = useMemo(
    () => [...symptoms].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)),
    [symptoms],
  );
  const recentMeasurements = useMemo(
    () => [...measurements]
      .sort((left, right) => Date.parse(right.measuredAt) - Date.parse(left.measuredAt))
      .slice(0, 8),
    [measurements],
  );
  const activeMedications = medications.filter((item) => item.status === "ACTIVE");

  function openCreate(): void {
    setEditingId(null);
    setDraft(emptyDraft());
    setError(null);
    setMessage(null);
    setIsFormOpen(true);
  }

  function openEdit(symptom: SymptomEntry): void {
    setEditingId(symptom.id);
    setDraft(draftFromSymptom(symptom));
    setError(null);
    setMessage(null);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm(): void {
    setIsFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
  }

  function toggleLink(field: "medicationIds" | "measurementIds", id: string): void {
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(id)
        ? current[field].filter((item) => item !== id)
        : [...current[field], id],
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (draft.name.trim().length < 2) {
      setError("Enter a symptom name using at least two characters.");
      return;
    }
    const occurredAt = new Date(draft.occurredAt);
    if (!draft.occurredAt || Number.isNaN(occurredAt.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }
    if (occurredAt.getTime() > Date.now() + 60_000) {
      setError("The symptom time cannot be in the future.");
      return;
    }

    const input: SymptomInput = {
      name: draft.name.trim(),
      severity: draft.severity,
      occurredAt: occurredAt.toISOString(),
      notes: draft.notes.trim() || null,
      medicationIds: draft.medicationIds,
      measurementIds: draft.measurementIds,
    };

    setMutationKey(editingId ? `edit:${editingId}` : "create");
    setError(null);
    setMessage(null);
    try {
      const saved = editingId
        ? await symptomService.update(editingId, input)
        : await symptomService.create(input);
      setSymptoms((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      closeForm();
      setMessage(editingId ? "Symptom entry updated." : "Symptom entry saved.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not save this symptom entry."),
      );
    } finally {
      setMutationKey(null);
    }
  }

  async function remove(symptom: SymptomEntry): Promise<void> {
    if (!window.confirm(`Delete the ${symptom.name} entry from ${formatDateTime(symptom.occurredAt)}?`)) {
      return;
    }
    setMutationKey(`delete:${symptom.id}`);
    setError(null);
    setMessage(null);
    try {
      await symptomService.remove(symptom.id);
      setSymptoms((current) => current.filter((item) => item.id !== symptom.id));
      setMessage("Symptom entry deleted.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not delete this symptom entry."),
      );
    } finally {
      setMutationKey(null);
    }
  }

  return (
    <main className="page-shell page-shell-narrow symptoms-page">
      <header className="page-heading page-heading-actions">
        <div>
          <p className="eyebrow">Personal health log</p>
          <h1>Symptoms</h1>
          <p>
            Record what you noticed, when it happened, and optional related records.
            This tracker stores observations and does not identify a cause or diagnosis.
          </p>
        </div>
        <button className="button button-primary" type="button" onClick={openCreate}>
          <span aria-hidden="true">＋</span> Record symptom
        </button>
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      {isFormOpen && (
        <section className="card form-card page-form symptom-form-card" aria-labelledby="symptom-form-title">
          <div className="section-heading section-heading-actions">
            <div>
              <h2 id="symptom-form-title">{editingId ? "Edit symptom entry" : "Record a symptom"}</h2>
              <p>Use your own words. Severity reflects how it felt to you.</p>
            </div>
            <button type="button" className="icon-button" aria-label="Close symptom form" onClick={closeForm}>×</button>
          </div>
          <form className="form-stack" onSubmit={save} noValidate>
            <div className="form-grid">
              <label className="field">
                <span>Symptom</span>
                <input
                  value={draft.name}
                  maxLength={120}
                  required
                  disabled={mutationKey !== null}
                  placeholder="e.g. Headache"
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Date and time</span>
                <input
                  type="datetime-local"
                  max={toDateTimeLocal(new Date().toISOString())}
                  value={draft.occurredAt}
                  required
                  disabled={mutationKey !== null}
                  onChange={(event) => setDraft((current) => ({ ...current, occurredAt: event.target.value }))}
                />
              </label>
              <label className="field field-wide symptom-severity-field">
                <span>Severity: <strong>{draft.severity}</strong> / 10</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={draft.severity}
                  disabled={mutationKey !== null}
                  onChange={(event) => setDraft((current) => ({ ...current, severity: Number(event.target.value) }))}
                />
                <small>1 is the lowest severity you choose to record; 10 is the highest.</small>
              </label>
              <label className="field field-wide">
                <span>Notes <small>(optional)</small></span>
                <textarea
                  rows={3}
                  maxLength={2_000}
                  value={draft.notes}
                  disabled={mutationKey !== null}
                  placeholder="What were you doing, how long did it last, or anything else you noticed?"
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
            </div>

            <div className="symptom-link-grid">
              <fieldset className="symptom-link-fieldset">
                <legend>Related medications <small>(optional)</small></legend>
                <p>Linking a record does not mean it caused the symptom.</p>
                {activeMedications.length === 0 ? (
                  <span className="muted-message">No active medications to link.</span>
                ) : (
                  <div className="symptom-link-options">
                    {activeMedications.slice(0, 8).map((medication) => (
                      <label key={medication.id}>
                        <input
                          type="checkbox"
                          checked={draft.medicationIds.includes(medication.id)}
                          disabled={mutationKey !== null}
                          onChange={() => toggleLink("medicationIds", medication.id)}
                        />
                        <span><strong>{medication.name}</strong><small>{medication.dosage}</small></span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <fieldset className="symptom-link-fieldset">
                <legend>Recent measurements <small>(optional)</small></legend>
                <p>Choose readings that may provide useful time context.</p>
                {recentMeasurements.length === 0 ? (
                  <span className="muted-message">No recent measurements to link.</span>
                ) : (
                  <div className="symptom-link-options">
                    {recentMeasurements.map((measurement) => (
                      <label key={measurement.id}>
                        <input
                          type="checkbox"
                          checked={draft.measurementIds.includes(measurement.id)}
                          disabled={mutationKey !== null}
                          onChange={() => toggleLink("measurementIds", measurement.id)}
                        />
                        <span>
                          <strong>{measurementMetadata[measurement.type].label}: {formatMeasurement(measurement)}</strong>
                          <small>{formatDateTime(measurement.measuredAt)}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            </div>

            <p className="form-helper-note">
              Linked medications and measurements provide context only. The app does not infer that one record caused another.
            </p>
            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={mutationKey !== null}>
                {mutationKey ? "Saving…" : editingId ? "Save changes" : "Save symptom"}
              </button>
              <button className="button button-secondary" type="button" disabled={mutationKey !== null} onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="card data-section symptom-history-card" aria-labelledby="symptom-history-title">
        <div className="section-heading section-heading-actions">
          <div>
            <p className="eyebrow">History</p>
            <h2 id="symptom-history-title">Recorded symptoms</h2>
            <p>Newest observations appear first.</p>
          </div>
          {!isLoading && <span className="metadata-pill">{symptoms.length} entries</span>}
        </div>
        {isLoading ? (
          <div className="inline-state" aria-live="polite"><span className="spinner" aria-hidden="true" /><p>Loading symptoms…</p></div>
        ) : orderedSymptoms.length === 0 ? (
          <div className="inline-state empty-state">
            <span className="state-icon" aria-hidden="true">S</span>
            <h3>No symptoms recorded</h3>
            <p>You can add an observation whenever you notice one.</p>
            <button className="button button-primary" type="button" onClick={openCreate}>Record first symptom</button>
          </div>
        ) : (
          <div className="symptom-history-list">
            {orderedSymptoms.map((symptom) => (
              <article className={`symptom-history-item severity-${severityTone(symptom.severity)}`} key={symptom.id}>
                <div className="symptom-history-heading">
                  <div>
                    <div className="badge-row">
                      <span className={`badge symptom-severity-badge severity-${severityTone(symptom.severity)}`}>
                        Severity {symptom.severity}/10
                      </span>
                      <time dateTime={symptom.occurredAt}>{formatDateTime(symptom.occurredAt)}</time>
                    </div>
                    <h3>{symptom.name}</h3>
                  </div>
                  <div className="row-actions">
                    <button className="button button-ghost button-small" type="button" disabled={mutationKey !== null} onClick={() => openEdit(symptom)}>Edit</button>
                    <button className="button button-danger-ghost button-small" type="button" disabled={mutationKey !== null} onClick={() => void remove(symptom)}>
                      {mutationKey === `delete:${symptom.id}` ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
                {symptom.notes && <p className="symptom-notes">{symptom.notes}</p>}
                {((symptom.medications?.length ?? 0) > 0 || (symptom.measurements?.length ?? 0) > 0) && (
                  <div className="symptom-related-records">
                    <strong>Related records</strong>
                    <div className="badge-row">
                      {(symptom.medications ?? []).map((medication) => (
                        <span className="metadata-pill" key={`medication:${medication.id}`}>Rx {medication.name} · {medication.dosage}</span>
                      ))}
                      {(symptom.measurements ?? []).map((measurement) => (
                        <span className="metadata-pill" key={`measurement:${measurement.id}`}>
                          {measurementMetadata[measurement.type].label} · {formatMeasurement(measurement)}
                        </span>
                      ))}
                    </div>
                    <small>Related for timeline context only; no cause is inferred.</small>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
