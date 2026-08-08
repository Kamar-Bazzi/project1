import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getApiErrorMessage } from "../services/api-error";
import { measurementService } from "../services/measurement.service";
import {
  measurementMetadata,
  measurementTypes,
  type Measurement,
  type MeasurementInput,
  type MeasurementType,
} from "../types/measurement";

interface MeasurementDraft {
  type: MeasurementType;
  value: string;
  secondaryValue: string;
  unit: string;
  measuredAt: string;
}

function nowForDateTimeInput(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function createEmptyDraft(): MeasurementDraft {
  return {
    type: "BLOOD_PRESSURE",
    value: "",
    secondaryValue: "",
    unit: measurementMetadata.BLOOD_PRESSURE.unit,
    measuredAt: nowForDateTimeInput(),
  };
}

function draftFromMeasurement(measurement: Measurement): MeasurementDraft {
  const measuredAt = new Date(measurement.measuredAt);
  const localMeasuredAt = new Date(
    measuredAt.getTime() - measuredAt.getTimezoneOffset() * 60_000,
  );

  return {
    type: measurement.type,
    value: String(measurement.value),
    secondaryValue:
      measurement.secondaryValue === null
        ? ""
        : String(measurement.secondaryValue),
    unit: measurement.unit,
    measuredAt: localMeasuredAt.toISOString().slice(0, 16),
  };
}

function formatMeasurementValue(measurement: Measurement): string {
  const secondary =
    measurement.secondaryValue === null
      ? ""
      : ` / ${measurement.secondaryValue}`;
  return `${measurement.value}${secondary} ${measurement.unit}`;
}

export default function MeasurementsPage() {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MeasurementDraft>(createEmptyDraft);
  const [typeFilter, setTypeFilter] = useState<"ALL" | MeasurementType>("ALL");
  const requestId = useRef(0);

  const loadMeasurements = useCallback(async (): Promise<void> => {
    const currentRequestId = ++requestId.current;

    setIsLoading(true);
    setLoadError(null);

    try {
      const nextMeasurements = await measurementService.list();

      if (requestId.current === currentRequestId) {
        setMeasurements(nextMeasurements);
      }
    } catch (error) {
      if (requestId.current === currentRequestId) {
        setLoadError(
          getApiErrorMessage(
            error,
            "We could not load your measurements. Please try again.",
          ),
        );
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadMeasurements();
  }, [loadMeasurements]);

  const sortedMeasurements = useMemo(
    () =>
      [...measurements]
        .filter((measurement) =>
          typeFilter === "ALL" ? true : measurement.type === typeFilter,
        )
        .sort(
          (first, second) =>
            Date.parse(second.measuredAt) - Date.parse(first.measuredAt),
        ),
    [measurements, typeFilter],
  );

  const recentCount = measurements.filter(
    (measurement) =>
      Date.now() - Date.parse(measurement.measuredAt) <= 7 * 24 * 60 * 60 * 1000,
  ).length;
  const latestMeasurement = [...measurements].sort(
    (first, second) => Date.parse(second.measuredAt) - Date.parse(first.measuredAt),
  )[0];
  const typeCount = new Set(measurements.map((measurement) => measurement.type)).size;

  function closeForm(): void {
    setIsFormOpen(false);
    setEditingId(null);
    setDraft(createEmptyDraft());
    setActionError(null);
  }

  function openCreateForm(): void {
    setEditingId(null);
    setDraft(createEmptyDraft());
    setActionError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function openEditForm(measurement: Measurement): void {
    setEditingId(measurement.id);
    setDraft(draftFromMeasurement(measurement));
    setActionError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    setSuccessMessage(null);

    const value = Number(draft.value);
    const secondaryValue = draft.secondaryValue
      ? Number(draft.secondaryValue)
      : null;
    const needsSecondaryValue = draft.type === "BLOOD_PRESSURE";

    if (!draft.value || !Number.isFinite(value) || value <= 0) {
      setActionError("Enter a valid measurement value greater than zero.");
      return;
    }

    if (
      needsSecondaryValue &&
      (!draft.secondaryValue ||
        secondaryValue === null ||
        !Number.isFinite(secondaryValue) ||
        secondaryValue <= 0)
    ) {
      setActionError("Enter a valid diastolic blood pressure value.");
      return;
    }

    if (!draft.unit.trim() || !draft.measuredAt) {
      setActionError("Unit and measurement date are required.");
      return;
    }

    const measuredAt = new Date(draft.measuredAt);
    if (Number.isNaN(measuredAt.getTime())) {
      setActionError("Enter a valid measurement date and time.");
      return;
    }

    if (measuredAt.getTime() > Date.now()) {
      setActionError("Measurement date cannot be in the future.");
      return;
    }

    const input: MeasurementInput = {
      type: draft.type,
      value,
      secondaryValue: needsSecondaryValue ? secondaryValue : null,
      unit: draft.unit.trim(),
      measuredAt: measuredAt.toISOString(),
    };

    const actionKey = editingId ? `edit:${editingId}` : "create";
    setMutationKey(actionKey);

    try {
      const savedMeasurement = editingId
        ? await measurementService.update(editingId, input)
        : await measurementService.create(input);

      requestId.current += 1;
      setLoadError(null);
      setIsLoading(false);
      setMeasurements((currentMeasurements) => {
        const measurementExists = currentMeasurements.some(
          (measurement) => measurement.id === savedMeasurement.id,
        );

        if (!measurementExists) {
          return [savedMeasurement, ...currentMeasurements];
        }

        return currentMeasurements.map((measurement) =>
          measurement.id === savedMeasurement.id
            ? savedMeasurement
            : measurement,
        );
      });

      const message = editingId ? "Measurement updated." : "Measurement recorded.";
      closeForm();
      setSuccessMessage(message);
    } catch (error) {
      setActionError(
        getApiErrorMessage(
          error,
          `The measurement could not be ${editingId ? "updated" : "recorded"}.`,
        ),
      );
    } finally {
      setMutationKey(null);
    }
  }

  async function handleDelete(measurement: Measurement): Promise<void> {
    if (!window.confirm(`Delete this ${measurementMetadata[measurement.type].label.toLowerCase()} reading?`)) {
      return;
    }

    setMutationKey(`delete:${measurement.id}`);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await measurementService.remove(measurement.id);
      requestId.current += 1;
      setLoadError(null);
      setIsLoading(false);
      setMeasurements((currentMeasurements) =>
        currentMeasurements.filter(
          (currentMeasurement) =>
            currentMeasurement.id !== measurement.id,
        ),
      );
      setSuccessMessage("Measurement deleted.");
    } catch (error) {
      setActionError(
        getApiErrorMessage(error, "The measurement could not be deleted."),
      );
    } finally {
      setMutationKey(null);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-heading page-heading-actions">
        <div>
          <p className="eyebrow">Health observations</p>
          <h1>Measurements</h1>
          <p>Record and review your health readings over time.</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          disabled={mutationKey !== null}
          onClick={openCreateForm}
        >
          <span aria-hidden="true">＋</span> Record measurement
        </button>
      </header>

      {isFormOpen && (
        <section className="card form-card page-form" aria-labelledby="measurement-form-title">
          <div className="section-heading section-heading-actions">
            <div>
              <h2 id="measurement-form-title">
                {editingId ? "Edit measurement" : "Record a measurement"}
              </h2>
              <p>Add the value exactly as shown on your device.</p>
            </div>
            <button
              className="icon-button"
              type="button"
              disabled={mutationKey !== null}
              onClick={closeForm}
              aria-label="Close form"
            >
              ×
            </button>
          </div>

          {actionError && <div className="alert alert-error" role="alert">{actionError}</div>}

          <form className="form-stack" onSubmit={handleSubmit} noValidate>
            <div className="form-grid form-grid-three">
              <label className="field">
                <span>Measurement type</span>
                <select
                  value={draft.type}
                  disabled={mutationKey !== null}
                  onChange={(event) => {
                    const type = event.target.value as MeasurementType;
                    setDraft((current) => ({
                      ...current,
                      type,
                      secondaryValue: type === "BLOOD_PRESSURE" ? current.secondaryValue : "",
                      unit: measurementMetadata[type].unit,
                    }));
                  }}
                >
                  {measurementTypes.map((type) => (
                    <option key={type} value={type}>{measurementMetadata[type].label}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>{measurementMetadata[draft.type].valueLabel}</span>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={draft.value}
                  disabled={mutationKey !== null}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, value: event.target.value }))
                  }
                  placeholder="Enter value"
                  required
                />
              </label>

              {draft.type === "BLOOD_PRESSURE" && (
                <label className="field">
                  <span>{measurementMetadata[draft.type].secondaryLabel}</span>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={draft.secondaryValue}
                    disabled={mutationKey !== null}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        secondaryValue: event.target.value,
                      }))
                    }
                    placeholder="Enter value"
                    required
                  />
                </label>
              )}

              <label className="field">
                <span>Unit</span>
                <input
                  value={draft.unit}
                  readOnly
                  maxLength={20}
                  aria-describedby="measurement-unit-help"
                  required
                />
                <small id="measurement-unit-help">Unit is set for the selected type.</small>
              </label>

              <label className="field">
                <span>Measured at</span>
                <input
                  type="datetime-local"
                  value={draft.measuredAt}
                  max={nowForDateTimeInput()}
                  disabled={mutationKey !== null}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      measuredAt: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={mutationKey !== null}>
                {mutationKey ? "Saving…" : editingId ? "Save changes" : "Record measurement"}
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

      <section className="summary-grid" aria-label="Measurement summary">
        <article className="summary-card">
          <span className="summary-icon summary-icon-blue" aria-hidden="true">◇</span>
          <div><p>Total readings</p><strong>{measurements.length}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-teal" aria-hidden="true">✓</span>
          <div><p>Last 7 days</p><strong>{recentCount}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-violet" aria-hidden="true">#</span>
          <div><p>Types tracked</p><strong>{typeCount}</strong></div>
        </article>
        <article className="summary-card summary-card-wide-value">
          <span className="summary-icon summary-icon-amber" aria-hidden="true">↗</span>
          <div>
            <p>Latest reading</p>
            <strong>{latestMeasurement ? formatMeasurementValue(latestMeasurement) : "—"}</strong>
          </div>
        </article>
      </section>

      <section className="card data-section">
        <div className="section-heading section-heading-actions">
          <div>
            <h2>Measurement history</h2>
            <p>Your newest readings appear first.</p>
          </div>
          <label className="compact-field">
            <span className="sr-only">Filter measurement type</span>
            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as "ALL" | MeasurementType)
              }
            >
              <option value="ALL">All measurement types</option>
              {measurementTypes.map((type) => (
                <option key={type} value={type}>{measurementMetadata[type].label}</option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="inline-state" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p>Loading measurements…</p>
          </div>
        ) : loadError ? (
          <div className="inline-state" role="alert">
            <span className="state-icon" aria-hidden="true">!</span>
            <h3>Measurements unavailable</h3>
            <p>{loadError}</p>
            <button className="button button-primary" onClick={() => void loadMeasurements()}>
              Try again
            </button>
          </div>
        ) : measurements.length === 0 ? (
          <div className="inline-state empty-state">
            <span className="state-icon" aria-hidden="true">＋</span>
            <h3>No measurements yet</h3>
            <p>Record your first health reading to begin your history.</p>
            <button className="button button-primary" onClick={openCreateForm}>
              Record first measurement
            </button>
          </div>
        ) : sortedMeasurements.length === 0 ? (
          <div className="inline-state empty-state">
            <h3>No matching readings</h3>
            <p>Choose another measurement type to view its history.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reading</th>
                  <th>Measured</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sortedMeasurements.map((measurement) => (
                  <tr key={measurement.id}>
                    <td>
                      <span className="measurement-type-cell">
                        <span className={`measurement-dot measurement-dot-${measurement.type.toLowerCase().replace(/_/g, "-")}`} />
                        {measurementMetadata[measurement.type].label}
                      </span>
                    </td>
                    <td><strong>{formatMeasurementValue(measurement)}</strong></td>
                    <td>
                      <time dateTime={measurement.measuredAt}>
                        {new Date(measurement.measuredAt).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </time>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="button button-ghost button-small" type="button" disabled={mutationKey !== null} onClick={() => openEditForm(measurement)}>
                          Edit
                        </button>
                        <button className="button button-danger-ghost button-small" type="button" disabled={mutationKey !== null} onClick={() => void handleDelete(measurement)}>
                          {mutationKey === `delete:${measurement.id}` ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
