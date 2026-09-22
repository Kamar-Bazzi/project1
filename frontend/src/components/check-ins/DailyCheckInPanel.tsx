import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../../services/api-error";
import { checkInService } from "../../services/patient-health.service";
import {
  type CheckInMedicationAdherence,
  type DailyHealthCheckIn,
  type DailyHealthCheckInInput,
} from "../../types/patient-health";

interface CheckInDraft {
  mood: number;
  painLevel: number;
  sleepQuality: number;
  symptomsText: string;
  activityMinutes: string;
  medicationAdherence: CheckInMedicationAdherence;
  notes: string;
}

const defaultDraft: CheckInDraft = {
  mood: 3,
  painLevel: 0,
  sleepQuality: 3,
  symptomsText: "",
  activityMinutes: "0",
  medicationAdherence: "NOT_APPLICABLE",
  notes: "",
};

const moodLabels = ["Very low", "Low", "Okay", "Good", "Very good"];
const sleepLabels = ["Very poor", "Poor", "Okay", "Good", "Very good"];
const adherenceLabels: Record<CheckInMedicationAdherence, string> = {
  ALL_TAKEN: "All scheduled doses taken",
  SOME_MISSED: "Some scheduled doses missed",
  NONE_TAKEN: "No scheduled doses taken",
  NOT_APPLICABLE: "No medication due today",
};

function draftFromCheckIn(checkIn: DailyHealthCheckIn): CheckInDraft {
  return {
    mood: checkIn.mood,
    painLevel: checkIn.painLevel,
    sleepQuality: checkIn.sleepQuality,
    symptomsText: checkIn.symptoms.join(", "),
    activityMinutes: String(checkIn.activityMinutes),
    medicationAdherence: checkIn.medicationAdherence,
    notes: checkIn.notes ?? "",
  };
}

function parseSymptoms(value: string): string[] {
  return [...new Set(
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function formatCheckInDate(value: string): string {
  const dateKey = value.slice(0, 10);
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export default function DailyCheckInPanel({
  showHistory = false,
}: {
  showHistory?: boolean;
}) {
  const [today, setToday] = useState<DailyHealthCheckIn | null>(null);
  const [history, setHistory] = useState<DailyHealthCheckIn[]>([]);
  const [draft, setDraft] = useState<CheckInDraft>(defaultDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const [todayResult, historyResult] = await Promise.all([
        checkInService.today(),
        showHistory ? checkInService.list() : Promise.resolve([]),
      ]);
      setToday(todayResult);
      setDraft(todayResult ? draftFromCheckIn(todayResult) : defaultDraft);
      setHistory(historyResult);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "We could not load your daily check-in.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [showHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const activityMinutes = Number(draft.activityMinutes);
    if (!Number.isInteger(activityMinutes) || activityMinutes < 0 || activityMinutes > 1_440) {
      setError("Activity minutes must be a whole number between 0 and 1,440.");
      return;
    }
    const symptoms = parseSymptoms(draft.symptomsText);
    if (symptoms.length > 20) {
      setError("Add no more than 20 symptoms to a daily check-in.");
      return;
    }
    if (symptoms.some((symptom) => symptom.length > 120)) {
      setError("Keep each symptom to 120 characters or fewer.");
      return;
    }

    const input: DailyHealthCheckInInput = {
      mood: draft.mood,
      painLevel: draft.painLevel,
      sleepQuality: draft.sleepQuality,
      symptoms,
      activityMinutes,
      medicationAdherence: draft.medicationAdherence,
      notes: draft.notes.trim() || null,
    };

    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await checkInService.saveToday(input);
      setToday(saved);
      setDraft(draftFromCheckIn(saved));
      setHistory((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setMessage(today ? "Today’s check-in was updated." : "Today’s check-in was saved.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not save your daily check-in."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="card daily-checkin" aria-labelledby="daily-checkin-title">
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">Daily check-in</p>
          <h2 id="daily-checkin-title">How are things today?</h2>
          <p>A quick personal record for your care history, not a medical assessment.</p>
        </div>
        {!showHistory && (
          <Link className="button button-ghost button-small" to="/check-ins">
            View history
          </Link>
        )}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      {isLoading ? (
        <div className="checkin-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading today’s check-in…</p>
        </div>
      ) : (
        <form className="checkin-form" onSubmit={save}>
          {today && (
            <p className="checkin-saved-note">
              <span aria-hidden="true">✓</span>
              You checked in today. You can update these answers until the day ends.
            </p>
          )}

          <div className="checkin-question-grid">
            <RatingField
              legend="Mood"
              value={draft.mood}
              labels={moodLabels}
              disabled={isSaving}
              onChange={(mood) => setDraft((current) => ({ ...current, mood }))}
            />
            <RatingField
              legend="Sleep quality"
              value={draft.sleepQuality}
              labels={sleepLabels}
              disabled={isSaving}
              onChange={(sleepQuality) =>
                setDraft((current) => ({ ...current, sleepQuality }))
              }
            />
          </div>

          <div className="checkin-detail-grid">
            <label className="field checkin-range-field">
              <span>Pain level: <strong>{draft.painLevel}</strong> / 10</span>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={draft.painLevel}
                disabled={isSaving}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    painLevel: Number(event.target.value),
                  }))
                }
              />
              <small>0 means no pain recorded; 10 is the highest level you choose to record.</small>
            </label>
            <label className="field">
              <span>Active minutes</span>
              <input
                type="number"
                min="0"
                max="1440"
                step="1"
                inputMode="numeric"
                value={draft.activityMinutes}
                disabled={isSaving}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    activityMinutes: event.target.value,
                  }))
                }
              />
              <small>Include walking, exercise, or other purposeful activity.</small>
            </label>
            <label className="field">
              <span>Medication adherence</span>
              <select
                value={draft.medicationAdherence}
                disabled={isSaving}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    medicationAdherence: event.target.value as CheckInMedicationAdherence,
                  }))
                }
              >
                {(Object.entries(adherenceLabels) as Array<
                  [CheckInMedicationAdherence, string]
                >).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Symptoms today <small>(optional)</small></span>
              <textarea
                rows={3}
                maxLength={500}
                value={draft.symptomsText}
                disabled={isSaving}
                placeholder="One per line or separated by commas"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    symptomsText: event.target.value,
                  }))
                }
              />
              <small>
                Add up to 20 brief symptoms, separated by commas or new lines. Use the symptom tracker for severity and linked records.
              </small>
            </label>
            <label className="field field-wide">
              <span>Notes <small>(optional)</small></span>
              <textarea
                rows={2}
                maxLength={2_000}
                value={draft.notes}
                disabled={isSaving}
                placeholder="Anything else you want to remember about today"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="form-actions checkin-actions">
            <button className="button button-primary" type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : today ? "Update today’s check-in" : "Save today’s check-in"}
            </button>
            <Link className="button button-secondary" to="/symptoms">
              Record symptom details
            </Link>
          </div>
        </form>
      )}

      {showHistory && !isLoading && (
        <div className="checkin-history">
          <div className="section-heading">
            <p className="eyebrow">Recent entries</p>
            <h2>Your check-in history</h2>
            <p>Newest entries appear first.</p>
          </div>
          {history.length === 0 ? (
            <div className="compact-empty-state">
              <span className="state-icon" aria-hidden="true">✓</span>
              <div><h3>No saved check-ins yet</h3><p>Complete today’s form to begin your history.</p></div>
            </div>
          ) : (
            <div className="checkin-history-list">
              {history.map((item) => (
                <article key={item.id}>
                  <div className="checkin-history-date">
                    <strong>{formatCheckInDate(item.localDate)}</strong>
                    <span className="badge badge-info">Daily check-in</span>
                  </div>
                  <dl>
                    <div><dt>Mood</dt><dd>{moodLabels[item.mood - 1] ?? `${item.mood}/5`}</dd></div>
                    <div><dt>Pain</dt><dd>{item.painLevel}/10</dd></div>
                    <div><dt>Sleep</dt><dd>{sleepLabels[item.sleepQuality - 1] ?? `${item.sleepQuality}/5`}</dd></div>
                    <div><dt>Activity</dt><dd>{item.activityMinutes} min</dd></div>
                  </dl>
                  <p><strong>Medication:</strong> {adherenceLabels[item.medicationAdherence]}</p>
                  <p><strong>Symptoms:</strong> {item.symptoms.length > 0 ? item.symptoms.join(", ") : "None recorded"}</p>
                  {item.notes && <p><strong>Notes:</strong> {item.notes}</p>}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RatingField({
  legend,
  value,
  labels,
  disabled,
  onChange,
}: {
  legend: string;
  value: number;
  labels: string[];
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="checkin-rating-field">
      <legend>{legend}</legend>
      <div className="checkin-rating" role="group" aria-label={legend}>
        {labels.map((label, index) => {
          const rating = index + 1;
          return (
            <button
              type="button"
              className={value === rating ? "is-selected" : ""}
              aria-pressed={value === rating}
              disabled={disabled}
              onClick={() => onChange(rating)}
              key={label}
            >
              <strong>{rating}</strong>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
