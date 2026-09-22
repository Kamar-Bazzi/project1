import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { doctorService } from "../../services/doctor.service";
import type { DoctorAlert, DoctorMonitoring } from "../../types/doctor";
import type { ReportPeriod } from "../../types/care";
import { DoctorStateCard, PatientLink, enumLabel, formatDateTime } from "./doctor-page-utils";

export default function DoctorMonitoringPage() {
  const [period, setPeriod] = useState<ReportPeriod>(30);
  const [monitoring, setMonitoring] = useState<DoctorMonitoring | null>(null);
  const [alerts, setAlerts] = useState<DoctorAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [monitoringResult, alertResult] = await Promise.all([
        doctorService.monitoring(period),
        doctorService.listAlerts(),
      ]);
      setMonitoring(monitoringResult);
      setAlerts(alertResult.items);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Monitoring data could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const unusualChanges = useMemo(() => monitoring?.patients.flatMap((item) => item.unusualChanges.map((change) => ({ patient: item.patient, change }))) ?? [], [monitoring]);

  return (
    <main className="page-shell doctor-page-shell">
      <header className="dashboard-hero doctor-dashboard-hero">
        <div><p className="eyebrow">Alerts / Monitoring</p><h1>Assigned-patient monitoring</h1><p>Review active alerts, abnormal trends, missed doses, and recent check-in signals.</p></div>
        <div className="period-selector compact-period-selector" role="group" aria-label="Monitoring period">{([7, 30, 90] as const).map((value) => <button key={value} type="button" className={period === value ? "is-active" : ""} onClick={() => setPeriod(value)}>{value}d</button>)}</div>
      </header>
      {error && <div className="alert alert-error" role="alert">{error}<button className="button button-ghost button-small" onClick={() => void load()}>Retry</button></div>}
      {isLoading ? <DoctorStateCard title="Loading monitoring" description="Analyzing assigned-patient records." busy /> : !monitoring ? <DoctorStateCard title="Monitoring unavailable" description="Monitoring data could not be loaded." onRetry={() => void load()} /> : (
        <>
          <section className="summary-grid" aria-label="Monitoring summary">
            <Summary label="Patients monitored" value={monitoring.patients.length} />
            <Summary label="Active alerts" value={alerts.length} />
            <Summary label="Urgent alerts" value={monitoring.patients.reduce((sum, item) => sum + item.urgentAlertCount, 0)} />
            <Summary label="Unusual changes" value={unusualChanges.length} />
          </section>
          <section className="card data-section">
            <div className="section-heading"><p className="eyebrow">Active health alerts</p><h2>Alerts</h2></div>
            {alerts.length === 0 ? <p className="muted-message">No active alerts.</p> : <div className="doctor-alert-list">{alerts.map((alert) => <article className={`doctor-alert-row alert-severity-${alert.severity.toLowerCase()}`} key={alert.id}><span className="alert-severity-marker" aria-hidden="true">!</span><div><div className="badge-row"><span className="badge badge-pending">{enumLabel(alert.severity)}</span><time dateTime={alert.detectedAt}>{formatDateTime(alert.detectedAt)}</time></div><h3>{alert.patient.user.name}</h3><p>{alert.message}</p></div><PatientLink patientId={alert.patientId}>Review</PatientLink></article>)}</div>}
          </section>
          <section className="card data-section">
            <div className="section-heading"><p className="eyebrow">Abnormal measurements and check-ins</p><h2>Monitoring summary</h2></div>
            {monitoring.patients.length === 0 ? <p className="muted-message">No assigned-patient monitoring data.</p> : <div className="unusual-change-grid">{monitoring.patients.map((item) => <article className="unusual-change-card" key={item.patient.id}><h3>{item.patient.user.name}</h3><p>{item.unusualChangeCount} unusual changes · {item.activeAlertCount} active alerts</p><p>Adherence {item.medicationAdherence.adherenceRate === null ? "unavailable" : `${Math.round(item.medicationAdherence.adherenceRate)}%`}</p>{item.latestMeasurements.slice(0, 3).map((measurement) => <small key={`${item.patient.id}:${measurement.type}`}>{enumLabel(measurement.type)} {measurement.latest} {measurement.unit} · {formatDateTime(measurement.latestAt)}</small>)}<PatientLink patientId={item.patient.id}>Open patient</PatientLink></article>)}</div>}
            <p className="report-disclaimer">{monitoring.disclaimer}</p>
          </section>
        </>
      )}
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <article className="summary-card"><span className="summary-icon summary-icon-teal" aria-hidden="true">M</span><div><p>{label}</p><strong>{value}</strong></div></article>;
}
