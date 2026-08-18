import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { careService } from "../../services/care.service";
import type { DoctorMonitoringOverview, ReportPeriod, UnusualChange } from "../../types/care";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMetric(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

export default function DoctorMonitoringPanel({ onOpenPatient }: { onOpenPatient: (patientId: string) => Promise<void> }) {
  const [period, setPeriod] = useState<ReportPeriod>(30);
  const [data, setData] = useState<DoctorMonitoringOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try { setData(await careService.doctorMonitoring(period)); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "Patient monitoring trends could not be loaded.")); }
    finally { setIsLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const unusualChanges = useMemo(() => data?.patients.flatMap((item) => item.unusualChanges.map((change, index) => ({ change, index, patient: item.patient }))) ?? [], [data]);

  return (
    <section className="card data-section doctor-monitoring-overview">
      <div className="section-heading section-heading-actions">
        <div><p className="eyebrow">Clinical monitoring</p><h2>Trends and unusual changes</h2><p>Recorded-data changes are prioritized for review and are not diagnoses.</p></div>
        <div className="period-selector compact-period-selector" role="group" aria-label="Monitoring period">{([7, 30, 90] as const).map((value) => <button key={value} type="button" className={period === value ? "is-active" : ""} onClick={() => setPeriod(value)}>{value}d</button>)}</div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {isLoading ? <div className="inline-state doctor-inline-state"><span className="spinner" aria-hidden="true" /><p>Analyzing assigned-patient trends…</p></div> : !data || data.patients.length === 0 ? <div className="inline-state doctor-inline-state"><span className="state-icon" aria-hidden="true">M</span><h3>No monitoring data</h3><p>Assigned patients will appear here as their records are updated.</p></div> : (
        <>
          <div className="monitoring-summary">
            <div><span>Patients monitored</span><strong>{data.patients.length}</strong></div>
            <div><span>Unusual changes</span><strong>{unusualChanges.length}</strong></div>
            <div><span>Urgent alerts</span><strong>{data.patients.reduce((sum, item) => sum + item.urgentAlertCount, 0)}</strong></div>
            <div><span>Low adherence</span><strong>{data.patients.filter((item) => item.medicationAdherence.adherenceRate !== null && item.medicationAdherence.adherenceRate < 80).length}</strong></div>
          </div>
          {data.patients.some((item) => item.activeEmergency) && <div className="monitoring-emergency-list">{data.patients.filter((item) => item.activeEmergency).map((item) => <button key={item.patient.id} type="button" onClick={() => void onOpenPatient(item.patient.id)}><span aria-hidden="true">!</span><strong>{item.patient.user.name} has an active urgent event</strong><small>Open assigned record</small></button>)}</div>}
          {unusualChanges.length === 0 ? <div className="monitoring-clear"><span aria-hidden="true">✓</span><div><strong>No unusual changes in this period</strong><small>Continue reviewing alerts and individual clinical context.</small></div></div> : <div className="unusual-change-grid">{unusualChanges.slice(0, 8).map(({ change, patient, index }) => <ChangeCard key={`${patient.id}:${change.metric}:${change.observedAt}:${index}`} change={change} patientId={patient.id} patientName={patient.user.name} onOpenPatient={onOpenPatient} />)}</div>}
          <p className="report-disclaimer">{data.disclaimer}</p>
        </>
      )}
    </section>
  );
}

function ChangeCard({ change, patientId, patientName, onOpenPatient }: { change: UnusualChange; patientId: string; patientName: string; onOpenPatient: (patientId: string) => Promise<void> }) {
  return <article className="unusual-change-card severity-warning"><div className="badge-row"><span className="badge badge-pending">{change.direction}</span><time dateTime={change.observedAt}>{formatDate(change.observedAt)}</time></div><h3>{formatMetric(change.metric)}</h3><strong>{patientName}</strong><p>{change.description}</p><div className="change-values"><span>Source <b>{formatMetric(change.source)}</b></span><span>Change <b>{change.changePercent.toFixed(1)}%</b></span></div><button type="button" className="button button-secondary button-small" onClick={() => void onOpenPatient(patientId)}>Review patient</button></article>;
}
