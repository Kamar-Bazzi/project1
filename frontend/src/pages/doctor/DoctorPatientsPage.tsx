import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, isForbiddenApiError, isNotFoundApiError } from "../../services/api-error";
import { doctorService } from "../../services/doctor.service";
import type { DoctorPatient } from "../../types/doctor";
import { measurementMetadata } from "../../types/measurement";
import { DoctorStateCard, PatientLink, formatDateTime, patientAge } from "./doctor-page-utils";

export default function DoctorPatientsPage() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await doctorService.listPatients(search.trim() || undefined);
      setPatients(result.items);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Assigned patients could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page-shell doctor-page-shell">
      <header className="dashboard-hero doctor-dashboard-hero">
        <div>
          <p className="eyebrow">Care panel</p>
          <h1>Assigned patients</h1>
          <p>Only patients with an active doctor assignment are listed here.</p>
        </div>
      </header>

      <section className="card data-section">
        <div className="section-heading section-heading-actions">
          <div>
            <h2>Patients</h2>
            <p>Search by patient name or email.</p>
          </div>
          <form
            className="inline-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <label className="compact-field">
              <span className="sr-only">Search patients</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search assigned patients"
              />
            </label>
            <button type="submit" className="button button-secondary button-small">
              Search
            </button>
          </form>
        </div>

        {error && (
          <div className="alert alert-error" role="alert" aria-live="assertive">
            {error}
            <button type="button" className="button button-ghost button-small" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <DoctorStateCard title="Loading assigned patients" description="Checking your current assignments." busy />
        ) : patients.length === 0 ? (
          <div className="inline-state">
            <span className="state-icon" aria-hidden="true">P</span>
            <h3>No assigned patients</h3>
            <p>An administrator must assign patients before they appear here.</p>
          </div>
        ) : (
          <div className="doctor-patient-list">
            {patients.map((patient) => {
              const latestMeasurement = patient.measurements?.[0];
              const activeAlert = patient.healthAlerts?.[0];
              const nextAppointment = patient.appointments?.[0];
              return (
                <article className="doctor-patient-row" key={patient.id}>
                  <div className="patient-list-avatar" aria-hidden="true">
                    {patient.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="doctor-patient-copy">
                    <h3>{patient.user.name}</h3>
                    <p>{patient.user.email} · {patientAge(patient.dateOfBirth)}</p>
                    <div className="badge-row">
                      <span className={`metadata-pill${patient._count.healthAlerts ? " metadata-pill-alert" : ""}`}>
                        {patient._count.healthAlerts} active alerts
                      </span>
                      <span className="metadata-pill">
                        {patient._count.medications} active meds
                      </span>
                      {latestMeasurement && (
                        <span className="metadata-pill">
                          {measurementMetadata[latestMeasurement.type].label}: {latestMeasurement.value}
                          {latestMeasurement.secondaryValue !== null ? `/${latestMeasurement.secondaryValue}` : ""} {latestMeasurement.unit}
                        </span>
                      )}
                      {activeAlert && <span className="badge badge-pending">{activeAlert.message}</span>}
                      {nextAppointment && (
                        <span className="metadata-pill">Next {formatDateTime(nextAppointment.appointmentDate)}</span>
                      )}
                    </div>
                  </div>
                  <PatientLink patientId={patient.id}>Open details</PatientLink>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function safePatientAccessMessage(error: unknown): string {
  return isForbiddenApiError(error) || isNotFoundApiError(error)
    ? "You do not have access to this patient."
    : getApiErrorMessage(error, "This patient workspace could not be loaded.");
}
