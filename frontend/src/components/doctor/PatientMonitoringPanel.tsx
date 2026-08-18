import { useCallback, useEffect, useMemo, useState } from "react";
import ReportSeriesChart from "../reports/ReportSeriesChart";
import { getApiErrorMessage } from "../../services/api-error";
import {
  careService,
  type ClinicalExportDataset,
  type ClinicalExportFormat,
} from "../../services/care.service";
import type { HealthTrend, PatientMonitoringReport, ReportPeriod } from "../../types/care";
import { downloadFile } from "../../utils/download-file";

const exportDatasetOptions: Array<{
  value: ClinicalExportDataset;
  label: string;
}> = [
  { value: "medical-history", label: "Medical history" },
  { value: "measurements", label: "Measurements" },
  { value: "appointments", label: "Appointments" },
  { value: "adherence", label: "Medication adherence" },
  { value: "wearables", label: "Wearable data" },
];

function metricLabel(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function trendKey(trend: HealthTrend, source: string): string {
  return `${source}:${trend.type}:${trend.unit}`;
}

export default function PatientMonitoringPanel({ patientId }: { patientId: string }) {
  const [period, setPeriod] = useState<ReportPeriod>(30);
  const [data, setData] = useState<PatientMonitoringReport | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [exportDataset, setExportDataset] = useState<ClinicalExportDataset>("medical-history");
  const [exportFormat, setExportFormat] = useState<ClinicalExportFormat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await careService.patientMonitoring(patientId, period);
      setData(result);
      const first = result.measurements[0]
        ? trendKey(result.measurements[0], "measurement")
        : result.wearableMetrics[0]
          ? trendKey(result.wearableMetrics[0], "wearable")
          : "";
      setSelectedKey(first);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Patient trends could not be loaded."));
    } finally { setIsLoading(false); }
  }, [patientId, period]);
  useEffect(() => { void load(); }, [load]);

  const trends = useMemo(() => [
    ...(data?.measurements.map((trend) => ({ trend, source: "measurement" })) ?? []),
    ...(data?.wearableMetrics.map((trend) => ({ trend, source: "wearable" })) ?? []),
  ], [data]);
  const selected = trends.find((item) => trendKey(item.trend, item.source) === selectedKey) ?? trends[0] ?? null;

  async function exportPatientData(format: ClinicalExportFormat): Promise<void> {
    if (!data) return;
    setExportFormat(format);
    setError(null);
    try {
      const result = await careService.downloadDataset(exportDataset, format, {
        patientId,
        from: data.period.from,
        to: data.period.to,
      });
      downloadFile(result.blob, result.fileName);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "The assigned-patient export could not be downloaded.",
        ),
      );
    } finally {
      setExportFormat(null);
    }
  }

  return (
    <section className="patient-monitoring-panel">
      <div className="section-heading section-heading-actions"><div><p className="eyebrow">Longitudinal view</p><h2>Patient trends</h2><p>Compare recent measurements, wearable metrics, and adherence.</p></div><div className="period-selector compact-period-selector" role="group" aria-label="Patient monitoring period">{([7, 30, 90] as const).map((value) => <button key={value} type="button" className={period === value ? "is-active" : ""} onClick={() => setPeriod(value)}>{value}d</button>)}</div></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {isLoading ? <p className="muted-message">Loading patient trends…</p> : data && <div className="patient-monitoring-content">
        <div className="patient-monitoring-summary"><span>Medication adherence <strong>{data.medicationAdherence.adherenceRate === null ? "—" : `${Math.round(data.medicationAdherence.adherenceRate)}%`}</strong></span><span>Unusual changes <strong>{data.unusualChanges.length}</strong></span><span>Active alerts <strong>{data.alerts.active}</strong></span></div>
        {trends.length > 0 && <label className="compact-field"><span className="sr-only">Trend series</span><select value={selected ? trendKey(selected.trend, selected.source) : ""} onChange={(event) => setSelectedKey(event.target.value)}>{trends.map((item) => <option key={trendKey(item.trend, item.source)} value={trendKey(item.trend, item.source)}>{metricLabel(item.trend.type)} · {item.source}</option>)}</select></label>}
        {selected && <ReportSeriesChart trend={selected.trend} />}
        {data.unusualChanges.length > 0 && <div className="patient-change-list">{data.unusualChanges.map((change, index) => <article key={`${change.metric}:${change.observedAt}:${index}`}><span className="badge badge-pending">{change.direction}</span><span><strong>{metricLabel(change.metric)} · {change.changePercent.toFixed(1)}%</strong><small>{change.description}</small></span></article>)}</div>}
        <div className="doctor-export-controls" aria-label="Assigned patient exports">
          <label className="compact-field">
            <span>Authorized export</span>
            <select
              value={exportDataset}
              onChange={(event) => setExportDataset(event.target.value as ClinicalExportDataset)}
              disabled={exportFormat !== null}
            >
              {exportDatasetOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="row-actions">
            {(["csv", "pdf"] as const).map((format) => (
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={exportFormat !== null}
                onClick={() => void exportPatientData(format)}
                key={format}
              >
                {exportFormat === format ? "Preparing…" : `Export ${format.toUpperCase()}`}
              </button>
            ))}
          </div>
        </div>
        <p className="report-disclaimer">{data.disclaimer}</p>
      </div>}
    </section>
  );
}
