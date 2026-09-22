import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { doctorService } from "../../services/doctor.service";
import type { DoctorAvailabilityWindow } from "../../types/doctor";
import { DoctorStateCard } from "./doctor-page-utils";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function minuteToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function timeToMinute(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

export default function DoctorAvailabilityPage() {
  const [timeZone, setTimeZone] = useState("UTC");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [windows, setWindows] = useState<DoctorAvailabilityWindow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await doctorService.getAvailability();
      setTimeZone(result.timeZone);
      setSlotDurationMinutes(result.slotDurationMinutes);
      setWindows(result.availabilityWindows);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Availability could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function updateWindow(index: number, update: Partial<DoctorAvailabilityWindow>) {
    setWindows((current) => current.map((window, candidate) => candidate === index ? { ...window, ...update } : window));
  }

  function addWindow(dayOfWeek = 1) {
    setWindows((current) => [...current, { dayOfWeek, startMinute: 9 * 60, endMinute: 17 * 60 }]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!timeZone.trim()) {
      setError("Enter a valid IANA time zone.");
      return;
    }
    if (windows.some((window) => window.startMinute >= window.endMinute)) {
      setError("Each availability range must end after it starts.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await doctorService.updateAvailability({
        timeZone: timeZone.trim(),
        slotDurationMinutes,
        windows: windows.map(({ dayOfWeek, startMinute, endMinute }) => ({
          dayOfWeek,
          startMinute,
          endMinute,
        })),
      });
      setWindows(result.availabilityWindows);
      setMessage("Availability saved.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Availability could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="page-shell doctor-page-shell">
      <header className="dashboard-hero doctor-dashboard-hero"><div><p className="eyebrow">Scheduling</p><h1>Availability</h1><p>Set working days and available time ranges for patient appointments.</p></div></header>
      {isLoading ? <DoctorStateCard title="Loading availability" description="Loading your weekly schedule." busy /> : (
        <section className="card data-section">
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {message && <div className="alert alert-success" role="status">{message}</div>}
          <form className="clinical-entry-form" onSubmit={save}>
            <div className="form-grid">
              <label className="field"><span>Time zone</span><input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} disabled={isSaving} /></label>
              <label className="field"><span>Slot duration minutes</span><input type="number" min={5} max={480} value={slotDurationMinutes} onChange={(event) => setSlotDurationMinutes(Number(event.target.value))} disabled={isSaving} /></label>
            </div>
            <div className="followup-plan-list">
              {windows.map((window, index) => <article className="followup-plan-card" key={`${window.dayOfWeek}:${window.startMinute}:${index}`}><div className="form-grid"><label className="field"><span>Day</span><select value={window.dayOfWeek} onChange={(event) => updateWindow(index, { dayOfWeek: Number(event.target.value) })}>{days.map((day, dayIndex) => <option value={dayIndex} key={day}>{day}</option>)}</select></label><label className="field"><span>Start</span><input type="time" value={minuteToTime(window.startMinute)} onChange={(event) => updateWindow(index, { startMinute: timeToMinute(event.target.value) })} /></label><label className="field"><span>End</span><input type="time" value={minuteToTime(window.endMinute)} onChange={(event) => updateWindow(index, { endMinute: timeToMinute(event.target.value) })} /></label><button type="button" className="button button-danger-ghost button-small" onClick={() => setWindows((current) => current.filter((_, candidate) => candidate !== index))}>Remove</button></div></article>)}
            </div>
            <div className="row-actions"><button type="button" className="button button-secondary button-small" onClick={() => addWindow()}>Add range</button><button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? "Saving..." : "Save availability"}</button></div>
          </form>
        </section>
      )}
    </main>
  );
}
