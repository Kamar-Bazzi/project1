import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { doctorDocumentService } from "../../services/doctor-document.service";
import type { PatientDocument } from "../../types/patient-document";
import { formatDateOnly } from "../../utils/date-only";
import { downloadFile } from "../../utils/download-file";

function formatTimestampDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function formatSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return "Size unavailable";
  if (sizeBytes < 1_024) return `${sizeBytes} B`;
  if (sizeBytes < 1_048_576) return `${(sizeBytes / 1_024).toFixed(1)} KB`;
  if (sizeBytes < 1_073_741_824) {
    return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
  }
  return `${(sizeBytes / 1_073_741_824).toFixed(1)} GB`;
}

function categoryLabel(category: string): string {
  if (category === "LABORATORY_REPORT") return "Laboratory report";
  const normalized = category.replace(/_/g, " ").toLowerCase();
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function statusLabel(document: PatientDocument): string {
  if (document.status === "PENDING_SCAN") return "Malware screening pending";
  if (document.status === "QUARANTINED") return "Unavailable after file review";
  if (document.status === "DELETED") return "Deleted";
  return "Available";
}

function statusBadgeClass(document: PatientDocument): string {
  if (document.status === "AVAILABLE") return "badge-active";
  if (document.status === "QUARANTINED") return "badge-cancelled";
  return "badge-pending";
}

export default function DoctorDocumentsPanel({ patientId }: { patientId: string }) {
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadDocuments = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      setDocuments(await doctorDocumentService.list(patientId));
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Documents could not be loaded for this assigned patient.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    setDocuments([]);
    setMessage(null);
    void loadDocuments();
  }, [loadDocuments]);

  async function download(document: PatientDocument): Promise<void> {
    setDownloadingId(document.id);
    setError(null);
    setMessage(null);
    try {
      const file = await doctorDocumentService.download(
        patientId,
        document.id,
        document.originalFileName,
      );
      downloadFile(file.blob, file.fileName);
      setMessage(`Downloaded ${document.title}.`);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "This document could not be downloaded. Your assignment may have changed.",
        ),
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="doctor-documents document-panel">
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">Patient files</p>
          <h2>Health documents</h2>
          <p>
            View or download files only while your patient assignment is active.
          </p>
        </div>
        <button
          type="button"
          className="button button-ghost button-small"
          onClick={() => void loadDocuments()}
          disabled={isLoading || downloadingId !== null}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      )}

      {isLoading ? (
        <div className="inline-state" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Loading authorized documents…</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="inline-state document-empty-state">
          <span className="state-icon" aria-hidden="true">
            Doc
          </span>
          <h3>No patient documents</h3>
          <p>Prescriptions and reports uploaded by this patient appear here.</p>
        </div>
      ) : (
        <div className="document-list doctor-document-list">
          {documents.map((document) => (
            <article className="document-card doctor-document-card" key={document.id}>
              <span className="document-card-icon" aria-hidden="true">
                Doc
              </span>
              <div className="document-card-copy">
                <div className="badge-row">
                  <span className="badge badge-info">
                    {categoryLabel(document.category)}
                  </span>
                  <span className={`badge ${statusBadgeClass(document)}`}>
                    {statusLabel(document)}
                  </span>
                </div>
                <h3>{document.title}</h3>
                {document.description && <p>{document.description}</p>}
                <div className="document-metadata">
                  <span>{document.originalFileName}</span>
                  <span>{formatSize(document.sizeBytes)}</span>
                  <span>
                    {document.documentDate
                      ? `Document date ${formatDateOnly(document.documentDate)}`
                      : `Uploaded ${formatTimestampDate(document.createdAt)}`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => void download(document)}
                disabled={
                  document.status !== "AVAILABLE" || downloadingId !== null
                }
              >
                {downloadingId === document.id ? "Downloading…" : "Download"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
