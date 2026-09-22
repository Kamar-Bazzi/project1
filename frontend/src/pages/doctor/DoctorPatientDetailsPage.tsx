import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DoctorCareNotesPanel from "../../components/doctor/DoctorCareNotesPanel";
import DoctorDocumentsPanel from "../../components/doctor/DoctorDocumentsPanel";
import DoctorPatientHistoryPanel from "../../components/doctor/DoctorPatientHistoryPanel";
import FollowUpPlansPanel from "../../components/doctor/FollowUpPlansPanel";
import PatientMonitoringPanel from "../../components/doctor/PatientMonitoringPanel";
import { doctorService } from "../../services/doctor.service";
import type { DoctorCheckIn, DoctorPatientDetail, DoctorPatientGoal, DoctorPatientSymptom } from "../../types/doctor";
import { measurementMetadata } from "../../types/measurement";
import { formatEnumLabel } from "../../types/medication";
import { DoctorStateCard, enumLabel, formatDate, formatDateTime, patientAge } from "./doctor-page-utils";
import { safePatientAccessMessage } from "./DoctorPatientsPage";

type PatientTab =
  | "overview"
  | "measurements"
  | "medications"
  | "history"
  | "symptoms"
  | "goals"
  | "notes"
  | "followups"
  | "documents"
  | "monitoring";

const tabs: Array<{ id: PatientTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "measurements", label: "Measurements" },
  { id: "medications", label: "Medications" },
  { id: "history", label: "Medical History" },
  { id: "symptoms", label: "Symptoms" },
  { id: "goals", label: "Health Goals" },
  { id: "notes", label: "Clinical Notes" },
  { id: "followups", label: "Follow-ups" },
  { id: "documents", label: "Documents" },
  { id: "monitoring", label: "Monitoring" },
];

export default function DoctorPatientDetailsPage() {
  const { patientId = "" } = useParams();
  const [patient, setPatient] = useState<DoctorPatientDetail | null>(null);
  const [symptoms, setSymptoms] = useState<DoctorPatientSymptom[]>([]);
  const [goals, setGoals] = useState<DoctorPatientGoal[]>([]);
  const [checkIns, setCheckIns] = useState<DoctorCheckIn[]>([]);
  const [activeTab, setActiveTab] = useState<PatientTab>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!patientId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [patientResult, symptomResult, goalResult, checkInResult] =
        await Promise.all([
          doctorService.getPatient(patientId),
          doctorService.getSymptoms(patientId).catch(() => []),
          doctorService.getGoals(patientId).catch(() => []),
          doctorService.getPatientCheckIns(patientId).catch(() => []),
        ]);
      setPatient(patientResult);
      setSymptoms(symptomResult);
      setGoals(goalResult);
      setCheckIns(checkInResult);
    } catch (requestError) {
      setError(safePatientAccessMessage(requestError));
      setPatient(null);
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const recentCheckIn = useMemo(() => checkIns[0] ?? null, [checkIns]);

  if (isLoading) {
    return (
      <main className="page-shell doctor-page-shell">
        <DoctorStateCard title="Loading patient workspace" description="Loading only authorized assigned-patient data." busy />
      </main>
    );
  }

  if (!patient) {
    return (
      <main className="page-shell doctor-page-shell">
        <DoctorStateCard title="Patient unavailable" description={error ?? "You do not have access to this patient."} onRetry={() => void load()} />
        <Link className="button button-secondary" to="/doctor/patients">Back to patients</Link>
      </main>
    );
  }

  return (
    <main className="page-shell doctor-page-shell">
      <header className="dashboard-hero doctor-dashboard-hero">
        <div>
          <p className="eyebrow">Assigned patient workspace</p>
          <h1>{patient.user.name}</h1>
          <p>{patient.user.email} · {patientAge(patient.dateOfBirth)} · {patient.timeZone || "No time zone"}</p>
        </div>
        <Link className="button button-secondary" to="/doctor/patients">All patients</Link>
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="admin-tabs" role="tablist" aria-label="Patient workspace sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="card data-section" role="tabpanel">
        {activeTab === "overview" && (
          <div className="patient-record-content">
            <dl className="patient-record-demographics">
              <div><dt>Phone</dt><dd>{patient.phoneNumber || "Not provided"}</dd></div>
              <div><dt>Emergency contact</dt><dd>{patient.emergencyContact || "Not provided"}</dd></div>
              <div><dt>Active medications</dt><dd>{patient.medications.length}</dd></div>
              <div><dt>Active alerts</dt><dd>{patient.healthAlerts.filter((alert) => alert.status === "ACTIVE").length}</dd></div>
            </dl>
            {recentCheckIn && (
              <article className="patient-record-list">
                <h3>Latest check-in</h3>
                <p>Mood {recentCheckIn.mood}/5 · Pain {recentCheckIn.painLevel}/10 · Sleep {recentCheckIn.sleepQuality}/5</p>
                <small>{formatDate(recentCheckIn.localDate)} · {recentCheckIn.symptoms.join(", ") || "No symptoms"}</small>
              </article>
            )}
          </div>
        )}

        {activeTab === "measurements" && (
          <DoctorTableEmpty empty={patient.measurements.length === 0} title="No measurements">
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Type</th><th>Value</th><th>Measured</th></tr></thead><tbody>{patient.measurements.map((measurement) => <tr key={measurement.id}><td>{measurementMetadata[measurement.type].label}</td><td><strong>{measurement.value}{measurement.secondaryValue !== null ? `/${measurement.secondaryValue}` : ""} {measurement.unit}</strong></td><td>{formatDateTime(measurement.measuredAt)}</td></tr>)}</tbody></table></div>
          </DoctorTableEmpty>
        )}

        {activeTab === "medications" && (
          <DoctorTableEmpty empty={patient.medications.length === 0} title="No medications">
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Dose</th><th>Status</th><th>Recent logs</th></tr></thead><tbody>{patient.medications.map((medication) => <tr key={medication.id}><td>{medication.name}</td><td>{medication.dosage}</td><td><span className={`badge badge-${medication.status.toLowerCase()}`}>{formatEnumLabel(medication.status)}</span></td><td>{medication.logs.slice(0, 3).map((log) => `${formatEnumLabel(log.status)} ${formatDateTime(log.scheduledFor)}`).join("; ") || "No logs"}</td></tr>)}</tbody></table></div>
          </DoctorTableEmpty>
        )}

        {activeTab === "history" && <DoctorPatientHistoryPanel patientId={patient.id} />}
        {activeTab === "symptoms" && <SymptomList symptoms={symptoms} />}
        {activeTab === "goals" && <GoalList goals={goals} />}
        {activeTab === "notes" && <DoctorCareNotesPanel patientId={patient.id} appointments={patient.appointments} />}
        {activeTab === "followups" && <FollowUpPlansPanel patientId={patient.id} />}
        {activeTab === "documents" && <DoctorDocumentsPanel patientId={patient.id} />}
        {activeTab === "monitoring" && <PatientMonitoringPanel patientId={patient.id} />}
      </section>
    </main>
  );
}

function DoctorTableEmpty({ empty, title, children }: { empty: boolean; title: string; children: ReactNode }) {
  return empty ? <div className="inline-state"><span className="state-icon" aria-hidden="true">i</span><h3>{title}</h3><p>No authorized records are available.</p></div> : <>{children}</>;
}

function SymptomList({ symptoms }: { symptoms: DoctorPatientSymptom[] }) {
  if (symptoms.length === 0) return <DoctorTableEmpty empty title="No symptoms">{null}</DoctorTableEmpty>;
  return <div className="clinical-document-list">{symptoms.map((symptom) => <article key={symptom.id}><h3>{symptom.name}</h3><p>Severity {symptom.severity}/10 · {formatDateTime(symptom.occurredAt)}</p>{symptom.notes && <small>{symptom.notes}</small>}</article>)}</div>;
}

function GoalList({ goals }: { goals: DoctorPatientGoal[] }) {
  if (goals.length === 0) return <DoctorTableEmpty empty title="No goals">{null}</DoctorTableEmpty>;
  return <div className="clinical-document-list">{goals.map((goal) => <article key={goal.id}><div className="badge-row"><span className={`badge badge-${goal.status.toLowerCase()}`}>{enumLabel(goal.status)}</span><span className="metadata-pill">{enumLabel(goal.metric)}</span></div><h3>{goal.title}</h3><p>Target {goal.targetValue}{goal.targetSecondaryValue !== null ? `-${goal.targetSecondaryValue}` : ""} {goal.unit}</p><small>{goal.progressPercent === null || goal.progressPercent === undefined ? "Progress unavailable" : `${Math.round(goal.progressPercent)}% progress`}</small></article>)}</div>;
}
