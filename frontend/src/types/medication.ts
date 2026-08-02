export type MedicationStatus =
  | "PENDING"
  | "TAKEN"
  | "MISSED"
  | "SKIPPED";

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  scheduledTime: string;
  instructions: string;
  status: MedicationStatus;
}