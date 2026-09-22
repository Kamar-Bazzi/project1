import { type FormEvent, useCallback, useEffect, useState } from "react";

import { getApiErrorMessage } from "../../services/api-error";
import { privacyService } from "../../services/privacy.service";
import {
  patientExportDatasets,
  patientExportFormats,
  type AccountDeletionRequest,
  type PatientDataExportRequest,
  type PatientExportDataset,
  type PatientExportFormat,
} from "../../types/privacy";
import { downloadFile } from "../../utils/download-file";

const datasetLabels: Record<PatientExportDataset, string> = {
  all: "All patient data",
  medications: "Medications and dose history",
  measurements: "Measurements",
  appointments: "Appointments",
  "wearable-data": "Wearable devices and data",
  alerts: "Health alerts",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function PrivacyPage() {
  const [deletion, setDeletion] = useState<AccountDeletionRequest | null>(null);
  const [exports, setExports] = useState<PatientDataExportRequest[]>([]);
  const [dataset, setDataset] = useState<PatientExportDataset>("all");
  const [format, setFormat] = useState<PatientExportFormat>("json");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [cancelPassword, setCancelPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [mutation, setMutation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const [deletionResult, exportResult] = await Promise.all([
        privacyService.deletionStatus(),
        privacyService.listExports(),
      ]);
      setDeletion(deletionResult);
      setExports(exportResult);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "We could not load your privacy requests.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestExport(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const fromIso = toIso(from);
    const toIsoValue = toIso(to);
    if (from && !fromIso) {
      setError("Enter a valid export start date.");
      return;
    }
    if (to && !toIsoValue) {
      setError("Enter a valid export end date.");
      return;
    }
    if (fromIso && toIsoValue && fromIso > toIsoValue) {
      setError("The export start date must be before its end date.");
      return;
    }
    setMutation("export");
    setError(null);
    setMessage(null);
    try {
      const request = await privacyService.requestExport({
        dataset,
        format,
        from: fromIso,
        to: toIsoValue,
      });
      setExports((current) => [request, ...current]);
      setMessage("Your private export is ready to download for a limited time.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Your export could not be prepared."),
      );
    } finally {
      setMutation(null);
    }
  }

  async function download(request: PatientDataExportRequest): Promise<void> {
    setMutation(`download:${request.requestId}`);
    setError(null);
    try {
      const file = await privacyService.downloadExport(request);
      downloadFile(file.blob, file.fileName);
      setExports((current) =>
        current.map((item) =>
          item.requestId === request.requestId
            ? { ...item, downloadedAt: new Date().toISOString() }
            : item,
        ),
      );
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "The export could not be downloaded."),
      );
    } finally {
      setMutation(null);
    }
  }

  async function revoke(request: PatientDataExportRequest): Promise<void> {
    setMutation(`revoke:${request.requestId}`);
    setError(null);
    try {
      await privacyService.revokeExport(request.requestId);
      setExports((current) =>
        current.map((item) =>
          item.requestId === request.requestId
            ? { ...item, status: "REVOKED" }
            : item,
        ),
      );
      setMessage("Export access revoked.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Export access could not be revoked."));
    } finally {
      setMutation(null);
    }
  }

  async function requestDeletion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (confirmation !== "DELETE MY ACCOUNT") {
      setError("Type DELETE MY ACCOUNT exactly to confirm this request.");
      return;
    }
    setMutation("delete");
    setError(null);
    setMessage(null);
    try {
      const request = await privacyService.requestDeletion(deletePassword);
      setDeletion(request);
      setDeletePassword("");
      setConfirmation("");
      setMessage("Account deletion scheduled. You can cancel before processing begins.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Account deletion could not be scheduled."),
      );
    } finally {
      setMutation(null);
    }
  }

  async function cancelDeletion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMutation("cancel-delete");
    setError(null);
    try {
      const request = await privacyService.cancelDeletion(cancelPassword);
      setDeletion(request);
      setCancelPassword("");
      setMessage("Account deletion cancelled.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Account deletion could not be cancelled."),
      );
    } finally {
      setMutation(null);
    }
  }

  return (
    <main className="page-shell page-shell-narrow privacy-page">
      <header className="page-heading">
        <p className="eyebrow">Privacy controls</p>
        <h1>Your data and account</h1>
        <p>Download a portable copy of your records or manage a safe account-deletion request.</p>
      </header>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {isLoading ? (
        <div className="card state-card" aria-live="polite"><span className="spinner" aria-hidden="true" /><h2>Loading privacy controls</h2></div>
      ) : (
        <>
          <section className="card form-card" aria-labelledby="export-title">
            <div className="section-heading"><p className="eyebrow">Portable records</p><h2 id="export-title">Request a data export</h2><p>Exports may contain sensitive health information. Store downloaded files securely.</p></div>
            <form className="form-stack" onSubmit={requestExport}>
              <div className="form-grid form-grid-three">
                <label className="field"><span>Records</span><select value={dataset} onChange={(event) => setDataset(event.target.value as PatientExportDataset)}>{patientExportDatasets.map((value) => <option value={value} key={value}>{datasetLabels[value]}</option>)}</select></label>
                <label className="field"><span>File format</span><select value={format} onChange={(event) => setFormat(event.target.value as PatientExportFormat)}>{patientExportFormats.map((value) => <option value={value} key={value}>{value.toUpperCase()}</option>)}</select></label>
                <span />
                <label className="field"><span>From <small>(optional)</small></span><input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                <label className="field"><span>To <small>(optional)</small></span><input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
              </div>
              <button className="button button-primary" type="submit" disabled={mutation !== null}>{mutation === "export" ? "Preparing…" : "Prepare secure export"}</button>
            </form>
          </section>

          <section className="card data-section privacy-export-history" aria-labelledby="export-history-title">
            <div className="section-heading"><h2 id="export-history-title">Recent export requests</h2><p>Ready downloads expire automatically and can be revoked sooner.</p></div>
            {exports.length === 0 ? <p className="muted-message">No export requests yet.</p> : <div className="privacy-export-list">{exports.map((request) => <article key={request.requestId}><div><div className="badge-row"><span className={`badge badge-${request.status.toLowerCase()}`}>{request.status.toLowerCase()}</span><span className="badge badge-info">{request.format.toUpperCase()}</span></div><h3>{datasetLabels[request.dataset]}</h3><p>Created {formatDate(request.createdAt)} · Expires {formatDate(request.expiresAt)}</p>{request.downloadedAt && <small>Last downloaded {formatDate(request.downloadedAt)}</small>}</div><div className="row-actions"><button type="button" className="button button-primary button-small" disabled={mutation !== null || request.status !== "READY" || new Date(request.expiresAt) <= new Date()} onClick={() => void download(request)}>{mutation === `download:${request.requestId}` ? "Downloading…" : "Download"}</button><button type="button" className="button button-danger-ghost button-small" disabled={mutation !== null || request.status !== "READY"} onClick={() => void revoke(request)}>{mutation === `revoke:${request.requestId}` ? "Revoking…" : "Revoke"}</button></div></article>)}</div>}
          </section>

          <section className="card form-card danger-zone" aria-labelledby="account-deletion-title">
            <div className="section-heading"><p className="eyebrow">Danger zone</p><h2 id="account-deletion-title">Request account deletion</h2><p>Deletion is delayed so you can change your mind. When finalized, your patient profile and linked health records are permanently removed.</p></div>
            {deletion?.status === "PENDING" ? (
              <div className="deletion-pending"><div className="alert alert-warning" role="status"><strong>Deletion scheduled for {formatDate(deletion.scheduledFor)}</strong><span>You can cancel until processing starts.</span></div><form className="form-stack" onSubmit={cancelDeletion}><label className="field"><span>Current password to cancel</span><input type="password" autoComplete="current-password" value={cancelPassword} onChange={(event) => setCancelPassword(event.target.value)} minLength={8} maxLength={72} required /></label><button className="button button-secondary" type="submit" disabled={mutation !== null}>{mutation === "cancel-delete" ? "Cancelling…" : "Cancel account deletion"}</button></form></div>
            ) : deletion?.status === "PROCESSING" ? (
              <div className="alert alert-warning" role="status">Account deletion is processing and can no longer be cancelled.</div>
            ) : (
              <form className="form-stack" onSubmit={requestDeletion}>
                {deletion?.status === "CANCELLED" && <p className="muted-message">Your previous deletion request was cancelled.</p>}
                <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} minLength={8} maxLength={72} required /></label>
                <label className="field"><span>Type DELETE MY ACCOUNT</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required aria-describedby="deletion-confirmation-help" /></label>
                <small id="deletion-confirmation-help">This schedules deletion; it does not immediately remove your account.</small>
                <button className="button button-danger" type="submit" disabled={mutation !== null || confirmation !== "DELETE MY ACCOUNT"}>{mutation === "delete" ? "Scheduling…" : "Schedule account deletion"}</button>
              </form>
            )}
          </section>
        </>
      )}
    </main>
  );
}
