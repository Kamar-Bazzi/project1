import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { appointmentService } from "../../services/appointment.service";
import { doctorService } from "../../services/doctor.service";
import type { DoctorAppointment } from "../../types/doctor";
import { formatEnumLabel } from "../../types/medication";
import { DoctorStateCard, PatientLink, formatDateTime } from "./doctor-page-utils";

export default function DoctorAppointmentsPage() {
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [mutationId, setMutationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setAppointments(await doctorService.listAppointments());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Doctor appointments could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const upcoming = useMemo(() => appointments.filter((appointment) => appointment.status === "SCHEDULED" && Date.parse(appointment.appointmentDate) >= Date.now()), [appointments]);
  const history = useMemo(() => appointments.filter((appointment) => !upcoming.includes(appointment)), [appointments, upcoming]);

  async function setStatus(appointment: DoctorAppointment, status: "COMPLETED" | "CANCELLED") {
    setMutationId(appointment.id);
    setError(null);
    try {
      await appointmentService.update(appointment.id, { status });
      await load();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Appointment could not be updated."));
    } finally {
      setMutationId(null);
    }
  }

  return (
    <main className="page-shell doctor-page-shell">
      <header className="dashboard-hero doctor-dashboard-hero">
        <div><p className="eyebrow">Care schedule</p><h1>Doctor appointments</h1><p>Appointments are scoped to your assigned patients.</p></div>
      </header>
      {error && <div className="alert alert-error" role="alert">{error}<button className="button button-ghost button-small" onClick={() => void load()}>Retry</button></div>}
      {isLoading ? <DoctorStateCard title="Loading appointments" description="Loading your assigned-patient schedule." busy /> : appointments.length === 0 ? <DoctorStateCard title="No appointments" description="Assigned-patient appointments will appear here." /> : (
        <section className="card data-section">
          <AppointmentGroup title="Upcoming" appointments={upcoming} mutationId={mutationId} onStatus={setStatus} />
          <AppointmentGroup title="History" appointments={history} mutationId={mutationId} onStatus={setStatus} />
        </section>
      )}
    </main>
  );
}

function AppointmentGroup({ title, appointments, mutationId, onStatus }: { title: string; appointments: DoctorAppointment[]; mutationId: string | null; onStatus: (appointment: DoctorAppointment, status: "COMPLETED" | "CANCELLED") => Promise<void> }) {
  return <section aria-labelledby={`${title}-appointments`}><div className="appointment-section-heading"><h2 id={`${title}-appointments`}>{title}</h2><span>{appointments.length}</span></div>{appointments.length === 0 ? <p className="appointment-section-empty">No {title.toLowerCase()} appointments.</p> : <div className="appointment-list doctor-appointment-list">{appointments.map((appointment) => <article className="appointment-item" key={appointment.id}><div className="appointment-date-block" aria-hidden="true"><span>{new Date(appointment.appointmentDate).toLocaleDateString([], { month: "short" })}</span><strong>{new Date(appointment.appointmentDate).getDate()}</strong></div><div className="appointment-copy"><span className={`badge badge-${appointment.status.toLowerCase()}`}>{formatEnumLabel(appointment.status)}</span><h3>{appointment.patient.user.name}</h3><p>{formatDateTime(appointment.appointmentDate)}</p>{appointment.notes && <small>{appointment.notes}</small>}</div><div className="row-actions appointment-actions"><PatientLink patientId={appointment.patientId}>Patient</PatientLink>{appointment.status === "SCHEDULED" && <><button type="button" className="button button-secondary button-small" disabled={mutationId !== null} onClick={() => void onStatus(appointment, "COMPLETED")}>{mutationId === appointment.id ? "Saving..." : "Complete"}</button><button type="button" className="button button-danger-ghost button-small" disabled={mutationId !== null} onClick={() => void onStatus(appointment, "CANCELLED")}>Cancel</button></>}</div></article>)}</div>}</section>;
}
