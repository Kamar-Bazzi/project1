import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../../services/api-error";
import { careService } from "../../services/care.service";
import {
  medicalHistoryTypes,
  type MedicalHistoryItem,
  type MedicalHistoryType,
  type ReportPeriod,
} from "../../types/care";

const historyPresentation: Record<MedicalHistoryType, { label: string; icon: string }> = {
  APPOINTMENT: { label: "Appointments", icon: "Cal" },
  MEDICATION: { label: "Medications", icon: "Rx" },
  MEDICATION_LOG: { label: "Medication doses", icon: "✓" },
  MEASUREMENT: { label: "Measurements", icon: "M" },
  WEARABLE_METRIC: { label: "Wearable metrics", icon: "♥" },
  HEALTH_ALERT: { label: "Health alerts", icon: "!" },
  DOCTOR_NOTE: { label: "Doctor notes", icon: "Dr" },
  FOLLOW_UP: { label: "Follow-ups", icon: "↻" },
};

function formatDate(value: string): string {
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

function displayData(data: Record<string, unknown> | null): Array<[string, string]> {
  if (!data) return [];
  return Object.entries(data)
    .filter(([key, value]) =>
      !key.toLowerCase().endsWith("id") &&
      (typeof value === "string" || typeof value === "number" || typeof value === "boolean"),
    )
    .slice(0, 4)
    .map(([key, value]) => [
      key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " "),
      String(value),
    ]);
}

export default function MedicalHistoryPage() {
  const [period, setPeriod] = useState<ReportPeriod>(30);
  const [type, setType] = useState<MedicalHistoryType | "">("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MedicalHistoryItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [byType, setByType] = useState<Partial<Record<MedicalHistoryType, number>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await careService.medicalHistory({
        period,
        types: type ? [type] : undefined,
        page,
        pageSize: 30,
      });
      setItems(response.items);
      setTotalPages(Math.max(1, response.pagination.totalPages));
      setTotal(response.summary.total);
      setByType(response.summary.byType);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not load your medical history."));
    } finally {
      setIsLoading(false);
    }
  }, [page, period, type]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function changePeriod(nextPeriod: ReportPeriod): void {
    setPeriod(nextPeriod);
    setPage(1);
  }

  return (
    <main className="page-shell page-shell-narrow">
      <header className="page-heading page-heading-actions">
        <div>
          <p className="eyebrow">One care record</p>
          <h1>Medical history</h1>
          <p>See appointments, treatments, dose activity, readings, alerts, doctor notes, and follow-ups in one chronological timeline.</p>
        </div>
        <Link className="button button-secondary" to="/reports">Open health reports</Link>
      </header>

      <section className="history-overview card" aria-label="History filters and summary">
        <div className="period-selector" role="group" aria-label="History period">
          {([7, 30, 90] as const).map((value) => (
            <button key={value} type="button" className={period === value ? "is-active" : ""} onClick={() => changePeriod(value)}>{value} days</button>
          ))}
        </div>
        <label className="compact-field history-type-filter">
          <span className="sr-only">Filter history type</span>
          <select value={type} onChange={(event) => { setType(event.target.value as MedicalHistoryType | ""); setPage(1); }}>
            <option value="">All record types</option>
            {medicalHistoryTypes.map((itemType) => <option key={itemType} value={itemType}>{historyPresentation[itemType].label}</option>)}
          </select>
        </label>
        <div className="history-total"><strong>{total}</strong><span>events in this period</span></div>
      </section>

      {!type && total > 0 && (
        <section className="history-type-summary" aria-label="Record type counts">
          {medicalHistoryTypes.filter((itemType) => (byType[itemType] ?? 0) > 0).map((itemType) => (
            <div className="history-type-chip" key={itemType}><span aria-hidden="true">{historyPresentation[itemType].icon}</span><strong>{byType[itemType]}</strong><small>{historyPresentation[itemType].label}</small></div>
          ))}
        </section>
      )}

      {error && <div className="alert alert-error" role="alert">{error}<button type="button" className="inline-button" onClick={() => void loadHistory()}>Try again</button></div>}

      <section className="card medical-timeline-card" aria-labelledby="timeline-title">
        <div className="section-heading"><p className="eyebrow">Timeline</p><h2 id="timeline-title">Your latest care activity</h2><p>Newest events appear first.</p></div>
        {isLoading ? (
          <div className="inline-state" aria-live="polite"><span className="spinner" aria-hidden="true" /><p>Building your medical timeline…</p></div>
        ) : items.length === 0 ? (
          <div className="inline-state"><span className="state-icon" aria-hidden="true">i</span><h3>No events found</h3><p>Try a longer period or another record type.</p></div>
        ) : (
          <ol className="medical-timeline">
            {items.map((item) => <HistoryEvent item={item} key={`${item.type}:${item.id}`} />)}
          </ol>
        )}
        {totalPages > 1 && (
          <nav className="pagination-controls" aria-label="Medical history pages">
            <button type="button" className="button button-secondary button-small" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="button button-secondary button-small" disabled={page >= totalPages || isLoading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
          </nav>
        )}
      </section>
    </main>
  );
}

function HistoryEvent({ item }: { item: MedicalHistoryItem }) {
  const presentation = historyPresentation[item.type] ?? { label: item.type, icon: "•" };
  const details = displayData(item.data);
  return (
    <li className={`medical-timeline-item history-${item.type.toLowerCase().replace(/_/g, "-")}`}>
      <span className="timeline-marker" aria-hidden="true">{presentation.icon}</span>
      <article>
        <div className="timeline-event-heading"><div className="badge-row"><span className="badge badge-info">{presentation.label}</span>{item.status && <span className={`badge badge-${item.status.toLowerCase()}`}>{item.status.replace(/_/g, " ")}</span>}</div><time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time></div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        {details.length > 0 && <dl className="timeline-metadata">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      </article>
    </li>
  );
}
