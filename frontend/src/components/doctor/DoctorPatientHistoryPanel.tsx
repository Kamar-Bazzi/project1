import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { careService } from "../../services/care.service";
import type { MedicalHistoryResponse, ReportPeriod } from "../../types/care";

function label(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function DoctorPatientHistoryPanel({ patientId }: { patientId: string }) {
  const [period, setPeriod] = useState<ReportPeriod>(30);
  const [data, setData] = useState<MedicalHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try { setData(await careService.doctorMedicalHistory(patientId, { period, page: 1, pageSize: 20 })); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "This assigned patient's timeline could not be loaded.")); }
    finally { setIsLoading(false); }
  }, [patientId, period]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="patient-history-panel">
      <div className="section-heading section-heading-actions">
        <div><p className="eyebrow">Unified record</p><h2>Medical history timeline</h2><p>Appointments, medications, readings, alerts, notes, and follow-ups in one authorized view.</p></div>
        <div className="period-selector compact-period-selector" role="group" aria-label="Timeline period">{([7, 30, 90] as const).map((value) => <button key={value} type="button" className={period === value ? "is-active" : ""} onClick={() => setPeriod(value)}>{value}d</button>)}</div>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {isLoading ? <p className="muted-message">Loading authorized timeline…</p> : !data || data.items.length === 0 ? <p className="muted-message">No timeline events were found in this period.</p> : <div className="compact-history-timeline">{data.items.map((item) => <article key={`${item.type}:${item.id}`}><span className={`history-marker history-marker-${item.type.toLowerCase()}`} aria-hidden="true" /><div><div className="badge-row"><span className="badge badge-info">{label(item.type)}</span>{item.status && <span className="badge">{label(item.status)}</span>}<time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time></div><strong>{item.title}</strong><p>{item.summary}</p></div></article>)}</div>}
    </section>
  );
}
