import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getApiErrorMessage } from "../../services/api-error";
import DoctorCareNotesPanel from "../../components/doctor/DoctorCareNotesPanel";
import DoctorMonitoringPanel from "../../components/doctor/DoctorMonitoringPanel";
import PatientMonitoringPanel from "../../components/doctor/PatientMonitoringPanel";
import DoctorPatientHistoryPanel from "../../components/doctor/DoctorPatientHistoryPanel";
import { appointmentService } from "../../services/appointment.service";
import { doctorService } from "../../services/doctor.service";
import type {
  DoctorAppointment,
  DoctorDashboard,
  DoctorHealthAlert,
  DoctorMedication,
  DoctorPatientRecord,
  DoctorPatientSummary,
} from "../../types/doctor";
import {
  measurementMetadata,
  type Measurement,
} from "../../types/measurement";
import { formatEnumLabel } from "../../types/medication";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function patientAge(dateOfBirth: string | null): string {
  if (!dateOfBirth) return "Age unavailable";
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return "Age unavailable";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate())
  ) age -= 1;
  return `${age} years old`;
}

function measurementValue(measurement: Pick<Measurement, "value" | "secondaryValue" | "unit">): string {
  return measurement.secondaryValue === null
    ? `${measurement.value} ${measurement.unit}`
    : `${measurement.value}/${measurement.secondaryValue} ${measurement.unit}`;
}

export default function DoctorDashboardPage() {
  const [dashboard, setDashboard] = useState<DoctorDashboard | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatientRecord | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPatientLoading, setIsPatientLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      setDashboard(await doctorService.dashboard());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not load your clinical dashboard."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function openPatient(patientId: string): Promise<void> {
    setSelectedPatientId(patientId);
    setSelectedPatient(null);
    setIsPatientLoading(true);
    setError(null);
    try {
      setSelectedPatient(await doctorService.getPatient(patientId));
      window.setTimeout(() => document.getElementById("patient-record")?.scrollIntoView({ behavior: "smooth" }));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not load this assigned patient record."));
      setSelectedPatientId(null);
    } finally {
      setIsPatientLoading(false);
    }
  }

  if (isLoading && !dashboard) {
    return <main className="page-shell"><div className="card state-card" aria-live="polite"><span className="spinner" aria-hidden="true" /><h1>Loading your care team</h1><p>Gathering assigned patients and recent clinical activity.</p></div></main>;
  }

  if (!dashboard) {
    return <main className="page-shell"><div className="card state-card" role="alert"><span className="state-icon" aria-hidden="true">!</span><h1>Dashboard unavailable</h1><p>{error || "The doctor dashboard could not be loaded."}</p><button type="button" className="button button-primary" onClick={() => void loadDashboard()}>Try again</button></div></main>;
  }

  const firstName = dashboard.doctor.user.name.trim().split(/\s+/, 1)[0];

  return (
    <main className="page-shell doctor-page-shell">
      <header className="dashboard-hero doctor-dashboard-hero">
        <div><p className="eyebrow">Clinical workspace</p><h1>Welcome, Dr. {firstName}</h1><p>Review assigned patients, active alerts, treatment plans, new measurements, and today’s schedule.</p></div>
        <div className="doctor-profile-chip"><span className="doctor-profile-avatar" aria-hidden="true">{firstName.charAt(0).toUpperCase()}</span><span><strong>{dashboard.doctor.specialization || "General care"}</strong><small>{dashboard.doctor.licenseNumber ? `License ${dashboard.doctor.licenseNumber}` : "License not recorded"}</small></span></div>
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <section className="summary-grid" aria-label="Clinical summary">
        <SummaryCard label="Assigned patients" value={dashboard.summary.assignedPatients} icon="P" tone="blue" />
        <SummaryCard label="Active alerts" value={dashboard.summary.activeAlerts} icon="!" tone="amber" />
        <SummaryCard label="Active medications" value={dashboard.summary.activeMedications} icon="Rx" tone="violet" />
        <SummaryCard label="Upcoming visits" value={dashboard.summary.upcomingAppointments} icon="Cal" tone="teal" />
        <SummaryCard label="Missed doses · 24h" value={dashboard.summary.missedMedicationDoses ?? 0} icon="Rx!" tone="amber" />
        <SummaryCard label="Patients needing attention" value={dashboard.summary.patientsNeedingAttention ?? 0} icon="P!" tone="violet" />
      </section>

      <DoctorAttentionPanel dashboard={dashboard} onOpenPatient={openPatient} />

      <DoctorMonitoringPanel onOpenPatient={openPatient} />

      {(selectedPatientId || selectedPatient) && (
        <section id="patient-record" className="card patient-record-panel">
          <div className="section-heading section-heading-actions"><div><p className="eyebrow">Assigned patient record</p><h2>{selectedPatient?.user.name || "Loading patient…"}</h2><p>Read-only clinical context is limited to your active assignment.</p></div><button type="button" className="button button-ghost button-small" onClick={() => { setSelectedPatientId(null); setSelectedPatient(null); }}>Close record</button></div>
          {isPatientLoading ? <div className="inline-state"><span className="spinner" aria-hidden="true" /><p>Loading authorized patient data…</p></div> : selectedPatient && <PatientRecord patient={selectedPatient} />}
        </section>
      )}

      <div className="doctor-dashboard-grid">
        <section className="card data-section doctor-patient-section">
          <div className="section-heading section-heading-actions"><div><p className="eyebrow">Care panel</p><h2>Assigned patients</h2><p>Counts reflect the latest authorized records.</p></div><button type="button" className="button button-secondary button-small" onClick={() => void loadDashboard()} disabled={isLoading}>Refresh</button></div>
          {dashboard.patients.length === 0 ? <EmptyState icon="P" title="No assigned patients" description="An administrator must create an active doctor–patient assignment." /> : <div className="doctor-patient-list">{dashboard.patients.map((patient) => <PatientRow key={patient.id} patient={patient} onOpen={openPatient} isOpening={isPatientLoading && selectedPatientId === patient.id} />)}</div>}
        </section>

        <section className="card data-section doctor-alert-section">
          <div className="section-heading"><p className="eyebrow">Needs review</p><h2>Active health alerts</h2><p>Alerts support review and are not diagnoses.</p></div>
          {dashboard.alerts.length === 0 ? <EmptyState icon="✓" title="No active alerts" description="There are no current alerts across assigned patients." /> : <div className="doctor-alert-list">{dashboard.alerts.map((alert) => <AlertRow alert={alert} key={alert.id} onOpen={openPatient} />)}</div>}
        </section>
      </div>

      <section className="card data-section doctor-clinical-section">
        <div className="section-heading"><p className="eyebrow">Treatment overview</p><h2>Active medications</h2><p>Recent treatment plans across your assigned patients.</p></div>
        {dashboard.medications.length === 0 ? <EmptyState icon="Rx" title="No active medications" description="Active patient medications will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Patient</th><th>Medication</th><th>Dose</th><th>Schedule</th><th>Recent dose</th><th>Record</th></tr></thead><tbody>{dashboard.medications.map((medication) => <MedicationRow medication={medication} key={medication.id} onOpen={openPatient} />)}</tbody></table></div>}
      </section>

      <section className="card data-section doctor-clinical-section">
        <div className="section-heading"><p className="eyebrow">Latest readings</p><h2>Recent measurements</h2><p>Newest manual measurements from assigned patient records.</p></div>
        {dashboard.measurements.length === 0 ? <EmptyState icon="M" title="No measurements" description="Recent patient measurements will appear here." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Patient</th><th>Type</th><th>Value</th><th>Measured</th><th>Record</th></tr></thead><tbody>{dashboard.measurements.map((measurement) => <tr key={measurement.id}><td><strong>{measurement.patient.user.name}</strong></td><td>{measurementMetadata[measurement.type].label}</td><td><strong>{measurementValue(measurement)}</strong></td><td>{formatDateTime(measurement.measuredAt)}</td><td><button type="button" className="button button-secondary button-small" onClick={() => void openPatient(measurement.patientId)}>View</button></td></tr>)}</tbody></table></div>}
      </section>

      <AppointmentPanel
        appointments={dashboard.appointments}
        patients={dashboard.patients}
        onChanged={loadDashboard}
        setError={setError}
        setMessage={setMessage}
      />
    </main>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: "blue" | "teal" | "violet" | "amber" }) {
  return <article className="summary-card"><span className={`summary-icon summary-icon-${tone}`} aria-hidden="true">{icon}</span><div><p>{label}</p><strong>{value}</strong></div></article>;
}

function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return <div className="inline-state doctor-inline-state"><span className="state-icon" aria-hidden="true">{icon}</span><h3>{title}</h3><p>{description}</p></div>;
}

function DoctorAttentionPanel({ dashboard, onOpenPatient }: { dashboard: DoctorDashboard; onOpenPatient: (patientId: string) => Promise<void> }) {
  const patients = dashboard.patientsNeedingAttention ?? [];
  const missed = dashboard.missedMedicationLogs ?? [];
  return <div className="doctor-attention-grid"><section className="card data-section"><div className="section-heading"><p className="eyebrow">Priority review</p><h2>Patients needing attention</h2><p>Active urgent events, alerts, or recently missed doses.</p></div>{patients.length === 0 ? <div className="monitoring-clear"><span aria-hidden="true">✓</span><div><strong>No priority patients</strong><small>No assigned patient currently matches the attention rules.</small></div></div> : <div className="attention-patient-list">{patients.map((patient) => { const missedCount = patient.medications.reduce((sum, medication) => sum + medication.logs.length, 0); return <article key={patient.id}><div className="patient-list-avatar" aria-hidden="true">{patient.user.name.charAt(0).toUpperCase()}</div><div><strong>{patient.user.name}</strong><div className="badge-row">{patient.emergencyEvents.length > 0 && <span className="badge badge-cancelled">Active urgent event</span>}{patient.healthAlerts.length > 0 && <span className="badge badge-pending">{patient.healthAlerts.length} alert{patient.healthAlerts.length === 1 ? "" : "s"}</span>}{missedCount > 0 && <span className="badge badge-info">{missedCount} missed dose{missedCount === 1 ? "" : "s"}</span>}</div></div><button type="button" className="button button-secondary button-small" onClick={() => void onOpenPatient(patient.id)}>Review</button></article>; })}</div>}</section><section className="card data-section"><div className="section-heading"><p className="eyebrow">Adherence follow-up</p><h2>Recently missed doses</h2><p>Recorded missed medication doses from the last 24 hours.</p></div>{missed.length === 0 ? <p className="muted-message">No missed doses were recorded.</p> : <div className="missed-dose-list">{missed.map((log) => <article key={log.id}><span className="missed-dose-icon" aria-hidden="true">Rx</span><div><strong>{log.medication.patient.user.name}</strong><span>{log.medication.name} · {log.medication.dosage}</span><small>Scheduled {formatDateTime(log.scheduledFor)}</small></div><button type="button" className="button button-ghost button-small" onClick={() => void onOpenPatient(log.medication.patient.id)}>Open</button></article>)}</div>}</section></div>;
}

function PatientRow({ patient, onOpen, isOpening }: { patient: DoctorPatientSummary; onOpen: (patientId: string) => Promise<void>; isOpening: boolean }) {
  const nextAppointment = patient.appointments?.[0];
  return <article className="doctor-patient-row"><div className="patient-list-avatar" aria-hidden="true">{patient.user.name.charAt(0).toUpperCase()}</div><div className="doctor-patient-copy"><h3>{patient.user.name}</h3><p>{patient.user.email} · {patientAge(patient.dateOfBirth)}</p><div className="badge-row"><span className="metadata-pill">{patient._count.medications} medications</span><span className={`metadata-pill${patient._count.healthAlerts > 0 ? " metadata-pill-alert" : ""}`}>{patient._count.healthAlerts} alerts</span>{nextAppointment && <span className="metadata-pill">Next {formatDateTime(nextAppointment.appointmentDate)}</span>}</div></div><button type="button" className="button button-secondary button-small" onClick={() => void onOpen(patient.id)} disabled={isOpening}>{isOpening ? "Opening…" : "Open record"}</button></article>;
}

function AlertRow({ alert, onOpen }: { alert: DoctorHealthAlert; onOpen: (patientId: string) => Promise<void> }) {
  return <article className={`doctor-alert-row alert-severity-${alert.severity.toLowerCase()}`}><span className="alert-severity-marker" aria-hidden="true">!</span><div><div className="badge-row"><span className={`badge badge-${alert.severity === "URGENT" ? "cancelled" : alert.severity === "WARNING" ? "pending" : "info"}`}>{formatEnumLabel(alert.severity)}</span><small>{formatDateTime(alert.detectedAt)}</small></div><h3>{alert.patient.user.name}</h3><p>{alert.message}</p></div><button type="button" className="button button-ghost button-small" onClick={() => void onOpen(alert.patientId)}>Review</button></article>;
}

function MedicationRow({ medication, onOpen }: { medication: DoctorMedication; onOpen: (patientId: string) => Promise<void> }) {
  const recentLog = medication.logs[0];
  return <tr><td><strong>{medication.patient.user.name}</strong></td><td>{medication.name}</td><td>{medication.dosage}</td><td>{medication.schedules.map((schedule) => schedule.scheduledTime).join(", ") || "Not set"}</td><td>{recentLog ? <span className={`badge badge-${recentLog.status.toLowerCase()}`}>{formatEnumLabel(recentLog.status)}</span> : "No logs"}</td><td><button type="button" className="button button-secondary button-small" onClick={() => void onOpen(medication.patientId)}>View</button></td></tr>;
}

function PatientRecord({ patient }: { patient: DoctorPatientRecord }) {
  return <div className="patient-record-content"><dl className="patient-record-demographics"><div><dt>Email</dt><dd>{patient.user.email}</dd></div><div><dt>Age</dt><dd>{patientAge(patient.dateOfBirth)}</dd></div><div><dt>Phone</dt><dd>{patient.phoneNumber || "Not provided"}</dd></div><div><dt>Time zone</dt><dd>{patient.timeZone || "Not set"}</dd></div></dl><div className="patient-record-grid"><RecordList title="Medications" count={patient.medications.length}>{patient.medications.slice(0, 6).map((medication) => <div className="record-list-row" key={medication.id}><span><strong>{medication.name}</strong><small>{medication.dosage}</small></span><span className={`badge badge-${medication.status.toLowerCase()}`}>{formatEnumLabel(medication.status)}</span></div>)}</RecordList><RecordList title="Measurements" count={patient.measurements.length}>{patient.measurements.slice(0, 6).map((measurement) => <div className="record-list-row" key={measurement.id}><span><strong>{measurementMetadata[measurement.type].label}</strong><small>{formatDateTime(measurement.measuredAt)}</small></span><b>{measurementValue(measurement)}</b></div>)}</RecordList><RecordList title="Alerts" count={patient.healthAlerts.length}>{patient.healthAlerts.slice(0, 6).map((alert) => <div className="record-list-row" key={alert.id}><span><strong>{formatEnumLabel(alert.metricType)}</strong><small>{alert.message}</small></span><span className={`badge badge-${alert.severity === "URGENT" ? "cancelled" : "pending"}`}>{formatEnumLabel(alert.severity)}</span></div>)}</RecordList><RecordList title="Appointments" count={patient.appointments.length}>{patient.appointments.slice(0, 6).map((appointment) => <div className="record-list-row" key={appointment.id}><span><strong>{formatDateTime(appointment.appointmentDate)}</strong><small>{appointment.notes || "No notes"}</small></span><span className={`badge badge-${appointment.status.toLowerCase()}`}>{formatEnumLabel(appointment.status)}</span></div>)}</RecordList></div><DoctorPatientHistoryPanel patientId={patient.id} /><PatientMonitoringPanel patientId={patient.id} /><DoctorCareNotesPanel patientId={patient.id} appointments={patient.appointments} /></div>;
}

function RecordList({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section className="patient-record-list"><div className="section-heading section-heading-actions"><h3>{title}</h3><span className="dose-count">{count}</span></div>{count === 0 ? <p className="muted-message">No records.</p> : <div>{children}</div>}</section>;
}

function AppointmentPanel({ appointments, patients, onChanged, setError, setMessage }: { appointments: DoctorAppointment[]; patients: DoctorPatientSummary[]; onChanged: () => Promise<void>; setError: (message: string | null) => void; setMessage: (message: string | null) => void }) {
  const [allAppointments, setAllAppointments] = useState<DoctorAppointment[]>(appointments);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const loadAppointments = useCallback(async (): Promise<void> => {
    try { setAllAppointments(await appointmentService.list()); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "Appointment history could not be loaded.")); }
  }, [setError]);
  useEffect(() => { void loadAppointments(); }, [loadAppointments]);
  useEffect(() => { setAllAppointments((current) => current.length === 0 ? appointments : current); }, [appointments]);
  const ordered = useMemo(() => [...allAppointments].sort((first, second) => Date.parse(first.appointmentDate) - Date.parse(second.appointmentDate)), [allAppointments]);
  const upcoming = ordered.filter((appointment) => appointment.status === "SCHEDULED" && Date.parse(appointment.appointmentDate) >= Date.now());
  const history = ordered.filter((appointment) => appointment.status !== "SCHEDULED" || Date.parse(appointment.appointmentDate) < Date.now()).reverse();

  function beginEdit(appointment: DoctorAppointment): void {
    setEditingId(appointment.id);
    setPatientId(appointment.patientId);
    setAppointmentDate(toDateTimeLocal(appointment.appointmentDate));
    setNotes(appointment.notes ?? "");
    setError(null);
    document.getElementById("doctor-appointment-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearForm(): void {
    setEditingId(null);
    setPatientId("");
    setAppointmentDate("");
    setNotes("");
  }

  async function saveAppointment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!patientId || !appointmentDate || Date.parse(appointmentDate) <= Date.now()) { setError("Choose an assigned patient and a future appointment time."); return; }
    setMutationKey("save"); setError(null); setMessage(null);
    try {
      if (editingId) await appointmentService.update(editingId, { appointmentDate: new Date(appointmentDate).toISOString(), notes: notes.trim() || null });
      else await appointmentService.create({ patientId, appointmentDate: new Date(appointmentDate).toISOString(), notes: notes.trim() || null });
      await Promise.all([onChanged(), loadAppointments()]);
      setMessage(editingId ? "Appointment rescheduled." : "Appointment scheduled.");
      clearForm();
    }
    catch (requestError) { setError(getApiErrorMessage(requestError, editingId ? "We could not reschedule this appointment." : "We could not schedule this appointment.")); }
    finally { setMutationKey(null); }
  }

  async function setStatus(appointment: DoctorAppointment, status: "COMPLETED" | "CANCELLED"): Promise<void> {
    if (!window.confirm(`Mark this appointment ${status.toLowerCase()}?`)) return;
    setMutationKey(appointment.id); setError(null); setMessage(null);
    try { await appointmentService.update(appointment.id, { status }); await Promise.all([onChanged(), loadAppointments()]); setMessage(`Appointment marked ${status.toLowerCase()}.`); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "We could not update this appointment.")); }
    finally { setMutationKey(null); }
  }

  return <section className="card data-section doctor-appointments-section"><div className="section-heading section-heading-actions"><div><p className="eyebrow">Care schedule</p><h2>{editingId ? "Reschedule appointment" : "Appointments"}</h2><p>Create and manage visits only for assigned patients.</p></div>{editingId && <button type="button" className="button button-ghost button-small" onClick={clearForm}>Cancel editing</button>}</div><form id="doctor-appointment-form" className="doctor-appointment-form" onSubmit={saveAppointment}><label className="field"><span>Patient</span><select value={patientId} onChange={(event) => setPatientId(event.target.value)} disabled={mutationKey !== null || editingId !== null}><option value="">Choose an assigned patient</option>{patients.map((patient) => <option value={patient.id} key={patient.id}>{patient.user.name}</option>)}</select></label><label className="field"><span>Date and time</span><input type="datetime-local" min={toDateTimeLocal(new Date().toISOString())} value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} disabled={mutationKey !== null} /></label><label className="field"><span>Notes</span><input value={notes} maxLength={2_000} onChange={(event) => setNotes(event.target.value)} disabled={mutationKey !== null} placeholder="Optional visit notes" /></label><button type="submit" className="button button-primary" disabled={mutationKey !== null || patients.length === 0}>{mutationKey === "save" ? "Saving…" : editingId ? "Save new time" : "Schedule"}</button></form>{ordered.length === 0 ? <EmptyState icon="Cal" title="No appointments" description="Use the form above to schedule a visit." /> : <div className="appointment-sections"><DoctorAppointmentSection title="Upcoming" appointments={upcoming} mutationKey={mutationKey} onStatus={setStatus} onEdit={beginEdit} /><DoctorAppointmentSection title="History" appointments={history} mutationKey={mutationKey} onStatus={setStatus} onEdit={beginEdit} /></div>}</section>;
}

function DoctorAppointmentSection({ title, appointments, mutationKey, onStatus, onEdit }: { title: string; appointments: DoctorAppointment[]; mutationKey: string | null; onStatus: (appointment: DoctorAppointment, status: "COMPLETED" | "CANCELLED") => Promise<void>; onEdit: (appointment: DoctorAppointment) => void }) {
  return <section><div className="appointment-section-heading"><h3>{title}</h3><span>{appointments.length}</span></div>{appointments.length === 0 ? <p className="appointment-section-empty">No {title.toLowerCase()} appointments.</p> : <div className="appointment-list doctor-appointment-list">{appointments.map((appointment) => <article className="appointment-item" key={appointment.id}><div className="appointment-date-block" aria-hidden="true"><span>{new Date(appointment.appointmentDate).toLocaleDateString([], { month: "short" })}</span><strong>{new Date(appointment.appointmentDate).getDate()}</strong></div><div className="appointment-copy"><div className="badge-row"><span className={`badge badge-${appointment.status.toLowerCase()}`}>{formatEnumLabel(appointment.status)}</span></div><h3>{appointment.patient.user.name}</h3><p>{formatDateTime(appointment.appointmentDate)}</p>{appointment.notes && <small>{appointment.notes}</small>}</div>{appointment.status === "SCHEDULED" && <div className="row-actions appointment-actions"><button type="button" className="button button-ghost button-small" disabled={mutationKey !== null} onClick={() => onEdit(appointment)}>Reschedule</button><button type="button" className="button button-secondary button-small" disabled={mutationKey !== null} onClick={() => void onStatus(appointment, "COMPLETED")}>{mutationKey === appointment.id ? "Saving…" : "Complete"}</button><button type="button" className="button button-danger-ghost button-small" disabled={mutationKey !== null} onClick={() => void onStatus(appointment, "CANCELLED")}>Cancel</button></div>}</article>)}</div>}</section>;
}
