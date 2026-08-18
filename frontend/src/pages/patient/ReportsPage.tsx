import { useCallback, useEffect, useMemo, useState } from "react";
import ReportSeriesChart from "../../components/reports/ReportSeriesChart";
import { getApiErrorMessage } from "../../services/api-error";
import {
  careService,
  type ClinicalExportDataset,
  type ClinicalExportFormat,
} from "../../services/care.service";
import type { HealthTrend, PatientHealthReport, ReportPeriod } from "../../types/care";
import { downloadFile } from "../../utils/download-file";

const clinicalDatasets: Array<{
  dataset: ClinicalExportDataset;
  label: string;
  description: string;
}> = [
  {
    dataset: "medical-history",
    label: "Medical history",
    description: "Unified medications, readings, alerts, visits, and notes.",
  },
  {
    dataset: "measurements",
    label: "Measurements",
    description: "Patient-entered measurements in the selected period.",
  },
  {
    dataset: "appointments",
    label: "Appointments",
    description: "Scheduled, completed, and cancelled appointment records.",
  },
  {
    dataset: "adherence",
    label: "Medication adherence",
    description: "Scheduled doses and their recorded outcomes.",
  },
  {
    dataset: "wearables",
    label: "Wearable data",
    description: "Normalized activity, sleep, oxygen, and heart-rate records.",
  },
];

function formatNumber(value: number | null, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function formatMetric(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function trendKey(trend: HealthTrend, source: "measurement" | "wearable"): string {
  return `${source}:${trend.type}:${trend.unit}`;
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>(30);
  const [report, setReport] = useState<PatientHealthReport | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [downloadFormat, setDownloadFormat] = useState<"csv" | "pdf" | null>(null);
  const [datasetDownload, setDatasetDownload] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await careService.report(period);
      setReport(result);
      const first = result.measurements[0]
        ? trendKey(result.measurements[0], "measurement")
        : result.wearableMetrics[0]
          ? trendKey(result.wearableMetrics[0], "wearable")
          : "";
      setSelectedKey(first);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not generate your health report."));
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const trends = useMemo(() => [
    ...(report?.measurements.map((trend) => ({ trend, source: "measurement" as const })) ?? []),
    ...(report?.wearableMetrics.map((trend) => ({ trend, source: "wearable" as const })) ?? []),
  ], [report]);
  const selected = trends.find((item) => trendKey(item.trend, item.source) === selectedKey) ?? trends[0] ?? null;

  async function download(format: "csv" | "pdf"): Promise<void> {
    setDownloadFormat(format);
    setError(null);
    try {
      const result = await careService.downloadReport(period, format);
      downloadFile(result.blob, result.fileName);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, `The ${format.toUpperCase()} report could not be downloaded.`));
    } finally {
      setDownloadFormat(null);
    }
  }

  async function downloadDataset(
    dataset: ClinicalExportDataset,
    format: ClinicalExportFormat,
  ): Promise<void> {
    const downloadKey = `${dataset}:${format}`;
    setDatasetDownload(downloadKey);
    setError(null);
    try {
      const result = await careService.downloadDataset(dataset, format, {
        from: report?.period.from,
        to: report?.period.to,
      });
      downloadFile(result.blob, result.fileName);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          `The ${format.toUpperCase()} dataset could not be downloaded.`,
        ),
      );
    } finally {
      setDatasetDownload(null);
    }
  }

  return (
    <main className="page-shell page-shell-narrow reports-page">
      <header className="page-heading page-heading-actions">
        <div><p className="eyebrow">Care insights</p><h1>Health reports</h1><p>Review measurements, wearable activity, adherence, and unusual recorded-data changes.</p></div>
        <div className="row-actions">
          <button type="button" className="button button-secondary" disabled={downloadFormat !== null || !report} onClick={() => void download("csv")}>{downloadFormat === "csv" ? "Preparing CSV…" : "Download CSV"}</button>
          <button type="button" className="button button-primary" disabled={downloadFormat !== null || !report} onClick={() => void download("pdf")}>{downloadFormat === "pdf" ? "Preparing PDF…" : "Download PDF"}</button>
        </div>
      </header>

      <div className="period-selector report-period-selector" role="group" aria-label="Report period">
        {([7, 30, 90] as const).map((value) => <button key={value} type="button" className={period === value ? "is-active" : ""} onClick={() => setPeriod(value)}>{value} days</button>)}
      </div>
      {error && <div className="alert alert-error" role="alert">{error}<button type="button" className="inline-button" onClick={() => void load()}>Try again</button></div>}

      {isLoading ? (
        <div className="card state-card"><span className="spinner" aria-hidden="true" /><h2>Generating report</h2><p>Calculating trends from your authorized health records.</p></div>
      ) : report && (
        <>
          <section className="summary-grid report-summary-grid" aria-label="Report summary">
            <ReportSummary label="Medication adherence" value={formatNumber(report.medicationAdherence.adherenceRate, "%")} icon="Rx" tone="blue" />
            <ReportSummary label="Doses taken" value={`${report.medicationAdherence.taken}/${report.medicationAdherence.scheduled}`} icon="✓" tone="teal" />
            <ReportSummary label="Recorded trends" value={String(trends.length)} icon="M" tone="violet" />
            <ReportSummary label="Active alerts" value={String(report.alerts.active)} icon="!" tone="amber" />
          </section>

          <section className="card data-section report-trends-card">
            <div className="section-heading section-heading-actions">
              <div><p className="eyebrow">Trends</p><h2>Recorded health data over time</h2><p>Daily averages are descriptive and do not replace clinical review.</p></div>
              {trends.length > 0 && <label className="compact-field"><span className="sr-only">Choose trend</span><select value={selected ? trendKey(selected.trend, selected.source) : ""} onChange={(event) => setSelectedKey(event.target.value)}>{trends.map((item) => <option key={trendKey(item.trend, item.source)} value={trendKey(item.trend, item.source)}>{formatMetric(item.trend.type)} · {item.source}</option>)}</select></label>}
            </div>
            {selected ? (
              <>
                <div className="trend-stat-row">
                  <div><span>Average</span><strong>{formatNumber(selected.trend.average)} {selected.trend.unit}</strong></div>
                  <div><span>Low</span><strong>{formatNumber(selected.trend.minimum)} {selected.trend.unit}</strong></div>
                  <div><span>High</span><strong>{formatNumber(selected.trend.maximum)} {selected.trend.unit}</strong></div>
                  <div><span>Change</span><strong className={(selected.trend.changePercent ?? 0) > 0 ? "trend-up" : "trend-down"}>{formatNumber(selected.trend.changePercent, "%")}</strong></div>
                </div>
                <ReportSeriesChart trend={selected.trend} />
              </>
            ) : <div className="inline-state"><span className="state-icon" aria-hidden="true">M</span><h3>No trend data</h3><p>Record measurements or sync a wearable to build a trend.</p></div>}
          </section>

          <div className="report-detail-grid">
            <section className="card data-section adherence-report-card">
              <div className="section-heading"><p className="eyebrow">Treatment consistency</p><h2>Medication adherence</h2></div>
              <div className="adherence-overview"><strong>{formatNumber(report.medicationAdherence.adherenceRate, "%")}</strong><span>recorded adherence</span></div>
              <div className="adherence-count-grid"><span><b>{report.medicationAdherence.taken}</b>Taken</span><span><b>{report.medicationAdherence.missed}</b>Missed</span><span><b>{report.medicationAdherence.skipped}</b>Skipped</span><span><b>{report.medicationAdherence.pending}</b>Pending</span></div>
            </section>
            <section className="card data-section unusual-report-card">
              <div className="section-heading"><p className="eyebrow">Changes to review</p><h2>Unusual recorded changes</h2></div>
              {report.unusualChanges.length === 0 ? <p className="muted-message">No unusual changes were flagged for this period.</p> : <div className="report-change-list">{report.unusualChanges.map((change, index) => <article key={`${change.source}:${change.metric}:${change.observedAt}:${index}`}><span className="badge badge-pending">{change.direction}</span><div><strong>{formatMetric(change.metric)} · {change.changePercent.toFixed(1)}%</strong><small>{change.description}</small></div></article>)}</div>}
            </section>
          </div>

          <section className="card data-section clinical-export-card" aria-labelledby="clinical-export-title">
            <div className="section-heading">
              <p className="eyebrow">Portable records</p>
              <h2 id="clinical-export-title">Clinical data exports</h2>
              <p>Download only your authorized records for the selected {period}-day period. Exported files contain sensitive health information.</p>
            </div>
            <div className="clinical-export-list">
              {clinicalDatasets.map(({ dataset, label, description }) => (
                <article className="clinical-export-item" key={dataset}>
                  <div>
                    <h3>{label}</h3>
                    <p>{description}</p>
                  </div>
                  <div className="row-actions">
                    {(["csv", "pdf"] as const).map((format) => {
                      const key = `${dataset}:${format}`;
                      return (
                        <button
                          type="button"
                          className="button button-secondary button-small"
                          disabled={datasetDownload !== null}
                          onClick={() => void downloadDataset(dataset, format)}
                          key={format}
                        >
                          {datasetDownload === key ? "Preparing…" : format.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <p className="report-disclaimer">Generated {new Date(report.generatedAt).toLocaleString()}. {report.disclaimer}</p>
        </>
      )}
    </main>
  );
}

function ReportSummary({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: "blue" | "teal" | "violet" | "amber" }) {
  return <article className="summary-card"><span className={`summary-icon summary-icon-${tone}`} aria-hidden="true">{icon}</span><div><p>{label}</p><strong>{value}</strong></div></article>;
}
