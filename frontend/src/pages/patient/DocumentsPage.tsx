import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { patientDocumentService } from "../../services/patient-health.service";
import {
  patientDocumentCategories,
  type PatientDocument,
  type PatientDocumentCategory,
} from "../../types/patient-document";
import { formatDateOnly } from "../../utils/date-only";
import { downloadFile } from "../../utils/download-file";

const categoryLabels: Record<PatientDocumentCategory, string> = {
  PRESCRIPTION: "Prescription",
  LABORATORY_REPORT: "Laboratory report",
  MEDICAL_REPORT: "Medical report",
  OTHER: "Other health document",
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Unknown size";
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function statusCopy(document: PatientDocument): { label: string; detail: string; tone: string } {
  if (document.status === "AVAILABLE") {
    return { label: "Available", detail: "File validation and malware screening complete", tone: "completed" };
  }
  if (document.status === "QUARANTINED") {
    return {
      label: "Unavailable",
      detail: "This file did not pass file validation",
      tone: "cancelled",
    };
  }
  if (document.status === "DELETED") {
    return { label: "Deleted", detail: "This record is no longer available", tone: "skipped" };
  }
  return { label: "Checking file", detail: "Download will be enabled after malware screening", tone: "pending" };
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<PatientDocumentCategory>("PRESCRIPTION");
  const [description, setDescription] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const currentRequestId = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const nextDocuments = await patientDocumentService.list();
      if (requestId.current === currentRequestId) {
        setDocuments(nextDocuments);
      }
    } catch (requestError) {
      if (requestId.current === currentRequestId) {
        setError(
          getApiErrorMessage(requestError, "We could not load your health documents."),
        );
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedDocuments = useMemo(
    () => [...documents]
      .filter((document) => document.status !== "DELETED")
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [documents],
  );

  function chooseFile(event: ChangeEvent<HTMLInputElement>): void {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    if (nextFile && !title.trim()) {
      setTitle(nextFile.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!title.trim()) {
      setError("Enter a title for this document.");
      return;
    }
    if (title.trim().length > 160) {
      setError("Keep the document title to 160 characters or fewer.");
      return;
    }
    if (!file) {
      setError("Choose a document to upload.");
      return;
    }
    if (file.size === 0) {
      setError("The selected file is empty.");
      return;
    }

    setMutationKey("upload");
    setError(null);
    setMessage(null);
    try {
      const created = await patientDocumentService.upload({
        title: title.trim(),
        category,
        description: description.trim() || null,
        documentDate: documentDate || null,
        file,
      });
      requestId.current += 1;
      setIsLoading(false);
      setDocuments((current) => [created, ...current]);
      setTitle("");
      setDescription("");
      setDocumentDate("");
      setFile(null);
      setFileInputKey((current) => current + 1);
      setMessage(
        created.status === "AVAILABLE"
          ? "Document uploaded securely."
          : "Document uploaded and queued for malware screening.",
      );
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not upload this document."),
      );
    } finally {
      setMutationKey(null);
    }
  }

  async function download(document: PatientDocument): Promise<void> {
    if (document.status !== "AVAILABLE") return;
    setMutationKey(`download:${document.id}`);
    setError(null);
    try {
      const result = await patientDocumentService.download(document);
      downloadFile(result.blob, result.fileName);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not download this document."),
      );
    } finally {
      setMutationKey(null);
    }
  }

  async function remove(document: PatientDocument): Promise<void> {
    if (!window.confirm(`Delete “${document.title}”? This removes it from your document list.`)) {
      return;
    }
    setMutationKey(`delete:${document.id}`);
    setError(null);
    setMessage(null);
    try {
      await patientDocumentService.remove(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setMessage("Document deleted.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "We could not delete this document."),
      );
    } finally {
      setMutationKey(null);
    }
  }

  return (
    <main className="page-shell page-shell-narrow documents-page">
      <header className="page-heading">
        <p className="eyebrow">Private records</p>
        <h1>Health documents</h1>
        <p>
          Store prescriptions, laboratory reports, medical reports, and other health
          files. Downloads always require your authenticated account.
        </p>
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <section className="card form-card document-upload-card" aria-labelledby="document-upload-title">
        <div className="section-heading">
          <p className="eyebrow">Secure upload</p>
          <h2 id="document-upload-title">Add a document</h2>
          <p>PDF, JPEG, and PNG files are validated and malware-screened before storage.</p>
        </div>
        <form className="document-upload-form" onSubmit={upload}>
          <label className="field">
            <span>Document type</span>
            <select value={category} disabled={mutationKey !== null} onChange={(event) => setCategory(event.target.value as PatientDocumentCategory)}>
              {patientDocumentCategories.map((value) => <option value={value} key={value}>{categoryLabels[value]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              maxLength={160}
              required
              disabled={mutationKey !== null}
              placeholder="e.g. Blood work — August"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Document date <small>(optional)</small></span>
            <input type="date" value={documentDate} disabled={mutationKey !== null} onChange={(event) => setDocumentDate(event.target.value)} />
          </label>
          <label className="field document-file-field">
            <span>File</span>
            <input
              key={fileInputKey}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              required
              disabled={mutationKey !== null}
              onChange={chooseFile}
            />
            <small>{file ? `${file.name} · ${formatBytes(file.size)}` : "PDF, PNG, or JPEG. Upload limits are verified securely by the server."}</small>
          </label>
          <label className="field document-description-field">
            <span>Description <small>(optional)</small></span>
            <input value={description} maxLength={2_000} disabled={mutationKey !== null} placeholder="A short note to help identify this file" onChange={(event) => setDescription(event.target.value)} />
          </label>
          <button className="button button-primary" type="submit" disabled={mutationKey !== null}>
            {mutationKey === "upload" ? "Uploading…" : "Upload securely"}
          </button>
        </form>
        <p className="document-access-note">
          <span aria-hidden="true">◇</span>
          <span><strong>Access is restricted.</strong> You can access your own files. An assigned doctor can access only the documents authorized through the active care relationship.</span>
        </p>
      </section>

      <section className="card data-section document-list-card" aria-labelledby="document-list-title">
        <div className="section-heading section-heading-actions">
          <div>
            <p className="eyebrow">Your files</p>
            <h2 id="document-list-title">Uploaded documents</h2>
            <p>Sensitive file contents are never exposed through a public link.</p>
          </div>
          <button className="button button-secondary button-small" type="button" disabled={isLoading} onClick={() => void load()}>Refresh</button>
        </div>
        {isLoading ? (
          <div className="inline-state" aria-live="polite"><span className="spinner" aria-hidden="true" /><p>Loading documents…</p></div>
        ) : orderedDocuments.length === 0 ? (
          <div className="inline-state empty-state">
            <span className="state-icon" aria-hidden="true">Doc</span>
            <h3>No documents uploaded</h3>
            <p>Your secure document list will appear here.</p>
          </div>
        ) : (
          <div className="document-list">
            {orderedDocuments.map((document) => {
              const status = statusCopy(document);
              return (
                <article className="document-item" key={document.id}>
                  <span className="document-icon" aria-hidden="true">Doc</span>
                  <div className="document-copy">
                    <div className="badge-row">
                      <span className="badge badge-info">{categoryLabels[document.category]}</span>
                      <span className={`badge badge-${status.tone}`}>{status.label}</span>
                    </div>
                    <h3>{document.title}</h3>
                    <p>{document.originalFileName} · {formatBytes(document.sizeBytes)}</p>
                    {document.description && <p>{document.description}</p>}
                    <small>{status.detail} · {document.documentDate ? `Document dated ${formatDateOnly(document.documentDate)} · ` : ""}Uploaded {formatTimestamp(document.createdAt)}</small>
                  </div>
                  <div className="row-actions document-actions">
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      disabled={mutationKey !== null || document.status !== "AVAILABLE"}
                      onClick={() => void download(document)}
                    >
                      {mutationKey === `download:${document.id}` ? "Preparing…" : "Download"}
                    </button>
                    <button
                      className="button button-danger-ghost button-small"
                      type="button"
                      disabled={mutationKey !== null}
                      onClick={() => void remove(document)}
                    >
                      {mutationKey === `delete:${document.id}` ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
