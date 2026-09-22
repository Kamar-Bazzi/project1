import type { Measurement } from "./measurement";

export const wellnessIndicatorKeys = [
  "MEDICATION_ADHERENCE",
  "ACTIVITY",
  "SLEEP",
  "HEART_RATE",
  "MEASUREMENTS",
  "ALERTS",
] as const;

export type WellnessIndicatorKey = (typeof wellnessIndicatorKeys)[number];
export type WellnessIndicatorState = "ON_TRACK" | "REVIEW" | "NEEDS_DATA";

export interface WellnessIndicator {
  key: WellnessIndicatorKey;
  score: number | null;
  status: WellnessIndicatorState;
  value: number | null;
  unit: string | null;
  dataPoints: number;
  scoringBasis: string;
  summary: string;
}

export interface WellnessDashboard {
  generatedAt: string;
  period: { days: number; from: string; to: string };
  overall: {
    score: number | null;
    status: WellnessIndicatorState;
    availableComponents: number;
    totalComponents: number;
  };
  components: WellnessIndicator[];
  disclaimer: string;
}

export const checkInAdherenceOptions = [
  "ALL_TAKEN",
  "SOME_MISSED",
  "NONE_TAKEN",
  "NOT_APPLICABLE",
] as const;
export type CheckInMedicationAdherence =
  (typeof checkInAdherenceOptions)[number];

export interface DailyHealthCheckIn {
  id: string;
  localDate: string;
  timeZone: string;
  mood: number;
  painLevel: number;
  sleepQuality: number;
  symptoms: string[];
  activityMinutes: number;
  medicationAdherence: CheckInMedicationAdherence;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DailyHealthCheckInInput {
  mood: number;
  painLevel: number;
  sleepQuality: number;
  symptoms: string[];
  activityMinutes: number;
  medicationAdherence: CheckInMedicationAdherence;
  notes?: string | null;
}

export interface SymptomMedicationReference {
  id: string;
  name: string;
  dosage: string;
}

export type SymptomMeasurementReference = Pick<
  Measurement,
  "id" | "type" | "value" | "secondaryValue" | "unit" | "measuredAt"
>;

export interface SymptomEntry {
  id: string;
  name: string;
  severity: number;
  occurredAt: string;
  notes: string | null;
  medications: SymptomMedicationReference[];
  measurements: SymptomMeasurementReference[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SymptomInput {
  name: string;
  severity: number;
  occurredAt: string;
  notes?: string | null;
  medicationIds?: string[];
  measurementIds?: string[];
}
