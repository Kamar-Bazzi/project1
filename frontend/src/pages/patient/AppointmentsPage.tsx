import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { appointmentService } from "../../services/appointment.service";
import type {
  Appointment,
  AppointmentDoctor,
} from "../../types/appointment";
import { formatAppointmentStatus } from "../../types/appointment";

interface AppointmentFormState {
  doctorId: string;
  appointmentDate: string;
  notes: string;
}

interface AppointmentFormErrors {
  doctorId?: string;
  appointmentDate?: string;
  notes?: string;
  form?: string;
}

const emptyForm: AppointmentFormState = {
  doctorId: "",
  appointmentDate: "",
  notes: "",
};

function toDateTimeLocal(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatAppointmentDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<AppointmentDoctor[]>([]);
  const [form, setForm] = useState<AppointmentFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mutationId, setMutationId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [errors, setErrors] = useState<AppointmentFormErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadAppointments = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const result = await appointmentService.list();
      setAppointments(result);
    } catch (error) {
      setLoadError(
        getApiErrorMessage(
          error,
          "We could not load your appointments. Please try again.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDoctors = useCallback(async (): Promise<void> => {
    setDirectoryError(null);

    try {
      const result = await appointmentService.listDoctors();
      setDoctors(result);
    } catch (error) {
      setDirectoryError(
        getApiErrorMessage(
          error,
          "The doctor directory is temporarily unavailable.",
        ),
      );
    }
  }, []);

  useEffect(() => {
    void loadAppointments();
    void loadDoctors();
  }, [loadAppointments, loadDoctors]);

  const sortedAppointments = useMemo(
    () =>
      [...appointments].sort(
        (first, second) =>
          Date.parse(first.appointmentDate) -
          Date.parse(second.appointmentDate),
      ),
    [appointments],
  );
  const now = Date.now();
  const upcoming = sortedAppointments.filter(
    (appointment) =>
      appointment.status === "SCHEDULED" &&
      Date.parse(appointment.appointmentDate) >= now,
  );
  const history = sortedAppointments
    .filter((appointment) =>
      appointment.status !== "SCHEDULED" ||
      Date.parse(appointment.appointmentDate) < now,
    )
    .reverse();
  const completedCount = appointments.filter(
    (appointment) => appointment.status === "COMPLETED",
  ).length;
  const cancelledCount = appointments.filter(
    (appointment) => appointment.status === "CANCELLED",
  ).length;

  function validateForm(): AppointmentFormErrors {
    const nextErrors: AppointmentFormErrors = {};
    const appointmentTime = Date.parse(form.appointmentDate);

    if (!editingId && !form.doctorId) {
      nextErrors.doctorId = "Choose a doctor.";
    }

    if (!form.appointmentDate) {
      nextErrors.appointmentDate = "Choose an appointment date and time.";
    } else if (Number.isNaN(appointmentTime)) {
      nextErrors.appointmentDate = "Enter a valid date and time.";
    } else if (appointmentTime <= Date.now()) {
      nextErrors.appointmentDate = "Appointments must be scheduled in the future.";
    }

    if (form.notes.trim().length > 2_000) {
      nextErrors.notes = "Notes must contain at most 2,000 characters.";
    }

    return nextErrors;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const nextErrors = validateForm();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const appointmentDate = new Date(form.appointmentDate).toISOString();
      const notes = form.notes.trim() || null;

      if (editingId) {
        const updated = await appointmentService.update(editingId, {
          appointmentDate,
          notes,
        });
        setAppointments((current) =>
          current.map((appointment) =>
            appointment.id === updated.id ? updated : appointment,
          ),
        );
        setSuccessMessage("Appointment updated.");
      } else {
        const created = await appointmentService.create({
          doctorId: form.doctorId,
          appointmentDate,
          notes,
        });
        setAppointments((current) => [...current, created]);
        setSuccessMessage("Appointment scheduled.");
      }

      setForm(emptyForm);
      setEditingId(null);
    } catch (error) {
      setErrors({
        form: getApiErrorMessage(
          error,
          editingId
            ? "We could not update this appointment."
            : "We could not schedule this appointment.",
        ),
      });
    } finally {
      setIsSaving(false);
    }
  }

  function beginEditing(appointment: Appointment): void {
    setEditingId(appointment.id);
    setForm({
      doctorId: appointment.doctorId,
      appointmentDate: toDateTimeLocal(appointment.appointmentDate),
      notes: appointment.notes ?? "",
    });
    setErrors({});
    setSuccessMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing(): void {
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
  }

  async function cancelAppointment(appointment: Appointment): Promise<void> {
    if (!window.confirm("Cancel this appointment? This cannot be undone.")) {
      return;
    }

    setMutationId(appointment.id);
    setLoadError(null);
    setSuccessMessage(null);

    try {
      const updated = await appointmentService.update(appointment.id, {
        status: "CANCELLED",
      });
      setAppointments((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (editingId === appointment.id) cancelEditing();
      setSuccessMessage("Appointment cancelled.");
    } catch (error) {
      setLoadError(
        getApiErrorMessage(error, "We could not cancel this appointment."),
      );
    } finally {
      setMutationId(null);
    }
  }

  return (
    <main className="page-shell page-shell-narrow">
      <header className="page-heading">
        <p className="eyebrow">Care schedule</p>
        <h1>Appointments</h1>
        <p>Schedule visits, review upcoming care, and keep appointment details current.</p>
      </header>

      <section className="summary-grid" aria-label="Appointment summary">
        <article className="summary-card">
          <span className="summary-icon summary-icon-blue" aria-hidden="true">Cal</span>
          <div><p>Upcoming</p><strong>{upcoming.length}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-teal" aria-hidden="true">✓</span>
          <div><p>Completed</p><strong>{completedCount}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-amber" aria-hidden="true">×</span>
          <div><p>Cancelled</p><strong>{cancelledCount}</strong></div>
        </article>
        <article className="summary-card summary-card-wide-value">
          <span className="summary-icon summary-icon-violet" aria-hidden="true">Next</span>
          <div>
            <p>Next visit</p>
            <strong>
              {upcoming[0]
                ? new Date(upcoming[0].appointmentDate).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })
                : "None"}
            </strong>
          </div>
        </article>
      </section>

      {successMessage && (
        <div className="alert alert-success" role="status">{successMessage}</div>
      )}
      {loadError && (
        <div className="alert alert-error" role="alert">{loadError}</div>
      )}

      <section className="card form-card page-form" aria-labelledby="appointment-form-title">
        <div className="section-heading section-heading-actions">
          <div>
            <p className="eyebrow">{editingId ? "Reschedule" : "New visit"}</p>
            <h2 id="appointment-form-title">
              {editingId ? "Update appointment" : "Schedule an appointment"}
            </h2>
            <p>Your doctor will receive the appointment in their care schedule.</p>
          </div>
          {editingId && (
            <button type="button" className="button button-ghost button-small" onClick={cancelEditing}>
              Cancel editing
            </button>
          )}
        </div>

        {errors.form && <div className="alert alert-error" role="alert">{errors.form}</div>}
        {directoryError && !editingId && (
          <div className="alert alert-error" role="alert">
            {directoryError}{" "}
            <button type="button" className="inline-button" onClick={() => void loadDoctors()}>
              Try again
            </button>
          </div>
        )}

        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <label className="field">
              <span>Doctor</span>
              <select
                value={form.doctorId}
                onChange={(event) => setForm((current) => ({ ...current, doctorId: event.target.value }))}
                disabled={isSaving || Boolean(editingId) || Boolean(directoryError)}
                aria-invalid={Boolean(errors.doctorId)}
              >
                <option value="">Choose a doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.user.name}{doctor.specialization ? ` — ${doctor.specialization}` : ""}
                  </option>
                ))}
              </select>
              {errors.doctorId && <small className="field-error">{errors.doctorId}</small>}
            </label>

            <label className="field">
              <span>Date and time</span>
              <input
                type="datetime-local"
                value={form.appointmentDate}
                min={toDateTimeLocal(new Date().toISOString())}
                onChange={(event) => setForm((current) => ({ ...current, appointmentDate: event.target.value }))}
                disabled={isSaving}
                aria-invalid={Boolean(errors.appointmentDate)}
              />
              {errors.appointmentDate && <small className="field-error">{errors.appointmentDate}</small>}
            </label>

            <label className="field field-wide">
              <span>Reason or notes <small>(optional)</small></span>
              <textarea
                value={form.notes}
                maxLength={2_000}
                placeholder="Add a short reason for the visit or anything your doctor should know."
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                disabled={isSaving}
                aria-invalid={Boolean(errors.notes)}
              />
              {errors.notes && <small className="field-error">{errors.notes}</small>}
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={isSaving || (!editingId && doctors.length === 0)}>
              {isSaving ? "Saving…" : editingId ? "Save changes" : "Schedule appointment"}
            </button>
          </div>
        </form>
      </section>

      <section className="card data-section" aria-labelledby="appointment-list-title">
        <div className="section-heading section-heading-actions">
          <div>
            <p className="eyebrow">Your visits</p>
            <h2 id="appointment-list-title">Upcoming and past visits</h2>
            <p>Manage future appointments and review completed or cancelled visits.</p>
          </div>
          <button type="button" className="button button-secondary button-small" onClick={() => void loadAppointments()} disabled={isLoading}>
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="inline-state" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <p>Loading appointments…</p>
          </div>
        ) : sortedAppointments.length === 0 ? (
          <div className="inline-state empty-state">
            <span className="state-icon" aria-hidden="true">Cal</span>
            <h3>No appointments yet</h3>
            <p>Use the form above to schedule your first visit.</p>
          </div>
        ) : (
          <div className="appointment-sections">
            <section aria-labelledby="upcoming-appointments-title">
              <div className="appointment-section-heading"><h3 id="upcoming-appointments-title">Upcoming</h3><span>{upcoming.length}</span></div>
              {upcoming.length === 0 ? <p className="appointment-section-empty">No upcoming appointments.</p> : <div className="appointment-list">{upcoming.map((appointment) => <PatientAppointmentItem key={appointment.id} appointment={appointment} mutationId={mutationId} onEdit={beginEditing} onCancel={cancelAppointment} />)}</div>}
            </section>
            <section aria-labelledby="past-appointments-title">
              <div className="appointment-section-heading"><h3 id="past-appointments-title">History</h3><span>{history.length}</span></div>
              {history.length === 0 ? <p className="appointment-section-empty">No completed, cancelled, or past visits.</p> : <div className="appointment-list">{history.map((appointment) => <PatientAppointmentItem key={appointment.id} appointment={appointment} mutationId={mutationId} onEdit={beginEditing} onCancel={cancelAppointment} />)}</div>}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function PatientAppointmentItem({ appointment, mutationId, onEdit, onCancel }: { appointment: Appointment; mutationId: string | null; onEdit: (appointment: Appointment) => void; onCancel: (appointment: Appointment) => Promise<void> }) {
  const canManage = appointment.status === "SCHEDULED" && Date.parse(appointment.appointmentDate) > Date.now();
  return <article className="appointment-item"><div className="appointment-date-block" aria-hidden="true"><span>{new Date(appointment.appointmentDate).toLocaleDateString([], { month: "short" })}</span><strong>{new Date(appointment.appointmentDate).getDate()}</strong></div><div className="appointment-copy"><div className="badge-row"><span className={`badge badge-${appointment.status.toLowerCase()}`}>{formatAppointmentStatus(appointment.status)}</span>{appointment.doctor.specialization && <span className="metadata-pill">{appointment.doctor.specialization}</span>}</div><h3>Dr. {appointment.doctor.user.name}</h3><p>{formatAppointmentDate(appointment.appointmentDate)}</p>{appointment.notes && <small>{appointment.notes}</small>}</div><div className="row-actions appointment-actions">{canManage && <><button type="button" className="button button-secondary button-small" onClick={() => onEdit(appointment)} disabled={mutationId !== null}>Reschedule</button><button type="button" className="button button-danger-ghost button-small" onClick={() => void onCancel(appointment)} disabled={mutationId !== null}>{mutationId === appointment.id ? "Cancelling…" : "Cancel"}</button></>}</div></article>;
}
