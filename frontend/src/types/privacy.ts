export type AccountDeletionStatus =
  | "NONE"
  | "PENDING"
  | "PROCESSING"
  | "CANCELLED"
  | "COMPLETED";

export interface AccountDeletionRequest {
  status: AccountDeletionStatus;
  requestId: string | null;
  requestedAt: string | null;
  scheduledFor: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
}

export const patientExportFormats = ["csv", "json", "pdf"] as const;
export type PatientExportFormat = (typeof patientExportFormats)[number];

export const patientExportDatasets = [
  "all",
  "medications",
  "measurements",
  "appointments",
  "wearable-data",
  "alerts",
] as const;
export type PatientExportDataset = (typeof patientExportDatasets)[number];

export interface PatientDataExportRequest {
  requestId: string;
  format: PatientExportFormat;
  dataset: PatientExportDataset;
  status: "READY" | "EXPIRED" | "REVOKED";
  from: string | null;
  to: string | null;
  expiresAt: string;
  downloadedAt: string | null;
  createdAt: string;
}
