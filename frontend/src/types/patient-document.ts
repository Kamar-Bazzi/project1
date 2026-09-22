export const patientDocumentCategories = [
  "PRESCRIPTION",
  "LABORATORY_REPORT",
  "MEDICAL_REPORT",
  "OTHER",
] as const;

export type PatientDocumentCategory =
  (typeof patientDocumentCategories)[number];

export type PatientDocumentStatus =
  | "PENDING_SCAN"
  | "AVAILABLE"
  | "QUARANTINED"
  | "DELETED";

export interface PatientDocument {
  id: string;
  patientId: string;
  uploadedByUserId?: string;
  category: PatientDocumentCategory;
  title: string;
  description: string | null;
  documentDate: string | null;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  status: PatientDocumentStatus;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: {
    id: string;
    name: string;
    role?: string;
  };
}
