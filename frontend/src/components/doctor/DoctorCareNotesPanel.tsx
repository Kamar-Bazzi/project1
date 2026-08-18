import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { careService } from "../../services/care.service";
import type { DoctorFollowUp, DoctorNote } from "../../types/care";

interface AppointmentOption {
  id: string;
  appointmentDate: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function DoctorCareNotesPanel({ patientId, appointments }: { patientId: string; appointments: AppointmentOption[] }) {
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [followUps, setFollowUps] = useState<DoctorFollowUp[]>([]);
  const [activeForm, setActiveForm] = useState<"note" | "follow-up" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [appointmentId, setAppointmentId] = useState("");
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [followUpAt, setFollowUpAt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true); setError(null);
    try {
      const [noteResult, followUpResult] = await Promise.all([
        careService.listDoctorNotes(patientId),
        careService.listDoctorFollowUps(patientId),
      ]);
      setNotes(noteResult); setFollowUps(followUpResult);
    } catch (requestError) { setError(getApiErrorMessage(requestError, "Care notes could not be loaded.")); }
    finally { setIsLoading(false); }
  }, [patientId]);
  useEffect(() => { void load(); }, [load]);

  async function createNote(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (title.trim().length < 2 || content.trim().length < 2) { setError("Enter a title and note content."); return; }
    setIsSaving(true); setError(null); setMessage(null);
    try {
      const created = await careService.createDoctorNote(patientId, { title: title.trim(), content: content.trim(), category, appointmentId: appointmentId || null });
      setNotes((current) => [created, ...current]); setTitle(""); setContent(""); setAppointmentId(""); setActiveForm(null); setMessage("Doctor note added to the assigned patient record.");
    } catch (requestError) { setError(getApiErrorMessage(requestError, "The doctor note could not be saved.")); }
    finally { setIsSaving(false); }
  }

  async function createFollowUp(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (summary.trim().length < 2 || !occurredAt) { setError("Enter a follow-up summary and occurrence time."); return; }
    setIsSaving(true); setError(null); setMessage(null);
    try {
      const created = await careService.createDoctorFollowUp(patientId, { summary: summary.trim(), recommendations: recommendations.trim() || null, occurredAt: new Date(occurredAt).toISOString(), followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null, appointmentId: appointmentId || null });
      setFollowUps((current) => [created, ...current]); setSummary(""); setRecommendations(""); setFollowUpAt(""); setAppointmentId(""); setActiveForm(null); setMessage("Follow-up recorded.");
    } catch (requestError) { setError(getApiErrorMessage(requestError, "The follow-up could not be saved.")); }
    finally { setIsSaving(false); }
  }

  return <section className="doctor-care-notes"><div className="section-heading section-heading-actions"><div><p className="eyebrow">Clinical documentation</p><h2>Doctor notes and follow-ups</h2><p>Entries are limited to doctors with an active patient assignment.</p></div><div className="row-actions"><button type="button" className="button button-secondary button-small" onClick={() => setActiveForm(activeForm === "note" ? null : "note")}>Add note</button><button type="button" className="button button-primary button-small" onClick={() => setActiveForm(activeForm === "follow-up" ? null : "follow-up")}>Record follow-up</button></div></div>{error && <div className="alert alert-error" role="alert">{error}</div>}{message && <div className="alert alert-success" role="status">{message}</div>}{activeForm === "note" && <form className="clinical-entry-form" onSubmit={createNote}><div className="form-grid"><label className="field"><span>Title</span><input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} disabled={isSaving} /></label><label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} disabled={isSaving}><option value="GENERAL">General</option><option value="CARE_PLAN">Care plan</option><option value="MEDICATION_REVIEW">Medication review</option><option value="FOLLOW_UP">Follow-up</option></select></label><label className="field field-wide"><span>Clinical note</span><textarea value={content} maxLength={5_000} onChange={(event) => setContent(event.target.value)} disabled={isSaving} /></label><AppointmentSelect appointments={appointments} value={appointmentId} onChange={setAppointmentId} /></div><button className="button button-primary button-small" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save note"}</button></form>}{activeForm === "follow-up" && <form className="clinical-entry-form" onSubmit={createFollowUp}><div className="form-grid"><label className="field"><span>Occurred at</span><input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} disabled={isSaving} /></label><label className="field"><span>Next follow-up <small>(optional)</small></span><input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} disabled={isSaving} /></label><label className="field field-wide"><span>Summary</span><textarea value={summary} maxLength={3_000} onChange={(event) => setSummary(event.target.value)} disabled={isSaving} /></label><label className="field field-wide"><span>Recommendations <small>(optional)</small></span><textarea value={recommendations} maxLength={3_000} onChange={(event) => setRecommendations(event.target.value)} disabled={isSaving} /></label><AppointmentSelect appointments={appointments} value={appointmentId} onChange={setAppointmentId} /></div><button className="button button-primary button-small" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save follow-up"}</button></form>}{isLoading ? <p className="muted-message">Loading clinical documentation…</p> : <div className="clinical-document-grid"><section><h3>Notes <span>{notes.length}</span></h3>{notes.length === 0 ? <p className="muted-message">No notes recorded.</p> : <div className="clinical-document-list">{notes.map((note) => <article key={note.id}><div className="badge-row"><span className="badge badge-info">{note.category?.replace(/_/g, " ") || "General"}</span><time dateTime={note.createdAt}>{formatDate(note.createdAt)}</time></div><h4>{note.title}</h4><p>{note.content}</p><small>Dr. {note.doctor.user.name}</small></article>)}</div>}</section><section><h3>Follow-ups <span>{followUps.length}</span></h3>{followUps.length === 0 ? <p className="muted-message">No follow-ups recorded.</p> : <div className="clinical-document-list">{followUps.map((followUp) => <article key={followUp.id}><div className="badge-row"><span className="badge badge-completed">Follow-up</span><time dateTime={followUp.occurredAt}>{formatDate(followUp.occurredAt)}</time></div><h4>{followUp.summary}</h4>{followUp.recommendations && <p>{followUp.recommendations}</p>}<small>{followUp.followUpAt ? `Next follow-up ${formatDate(followUp.followUpAt)}` : "No next date set"} · Dr. {followUp.doctor.user.name}</small></article>)}</div>}</section></div>}</section>;
}

function AppointmentSelect({ appointments, value, onChange }: { appointments: AppointmentOption[]; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>Related appointment <small>(optional)</small></span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">No linked appointment</option>{appointments.map((appointment) => <option value={appointment.id} key={appointment.id}>{formatDate(appointment.appointmentDate)}</option>)}</select></label>;
}
