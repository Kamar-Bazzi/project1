import type { HealthMetricType } from "./health";
import type { MeasurementType } from "./measurement";
import type { EmergencyContact } from "./health";

export const medicalHistoryTypes = [
  "APPOINTMENT",
  "MEDICATION",
  "MEDICATION_LOG",
  "MEASUREMENT",
  "WEARABLE_METRIC",
  "HEALTH_ALERT",
  "DOCTOR_NOTE",
  "FOLLOW_UP",
] as const;

export type MedicalHistoryType = (typeof medicalHistoryTypes)[number];
export type ReportPeriod = 7 | 30 | 90;

export interface MedicalHistoryItem {
  id: string;
  type: MedicalHistoryType;
  occurredAt: string;
  title: string;
  summary: string;
  status: string | null;
  data: Record<string, unknown> | null;
}

export interface MedicalHistoryResponse {
  items: MedicalHistoryItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total: number;
    byType: Partial<Record<MedicalHistoryType, number>>;
  };
  period: { days: ReportPeriod; from: string; to: string };
}

export interface ReportPoint {
  date: string;
  average: number;
  minimum: number;
  maximum: number;
  count: number;
}

export interface HealthTrend {
  type: string;
  unit: string;
  count: number;
  latest: number;
  latestAt: string;
  average: number;
  minimum: number;
  maximum: number;
  previousAverage: number | null;
  changePercent: number | null;
  direction: "STABLE" | "INCREASING" | "DECREASING";
  unusualChange: boolean;
  series: ReportPoint[];
}

export interface PatientHealthReport {
  patient: {
    id: string;
    timeZone: string | null;
    user: { id: string; name: string; email: string };
  };
  period: { days: ReportPeriod; from: string; to: string; previousFrom: string };
  generatedAt: string;
  measurements: HealthTrend[];
  wearableMetrics: HealthTrend[];
  medicationAdherence: {
    scheduled: number;
    taken: number;
    missed: number;
    skipped: number;
    pending: number;
    adherenceRate: number | null;
    previousAdherenceRate: number | null;
    changePercentagePoints: number | null;
  };
  alerts: {
    total: number;
    active: number;
    urgent: number;
    bySeverity: { info: number; warning: number; urgent: number };
  };
  appointments: { total: number; scheduled: number; completed: number; cancelled: number };
  goals: Array<{
    id: string;
    title: string;
    metric: HealthGoalType;
    direction: HealthGoalDirection;
    targetValue: number;
    targetSecondaryValue: number | null;
    unit: string;
    targetDate: string | null;
    latestProgress: HealthGoalProgress | null;
  }>;
  activeEmergency: EmergencyEvent | null;
  unusualChanges: UnusualChange[];
  disclaimer: string;
}

export const healthGoalTypes = [
  "WEIGHT",
  "DAILY_STEPS",
  "DAILY_ACTIVITY_MINUTES",
  "HEART_RATE",
  "BLOOD_PRESSURE",
  "BLOOD_GLUCOSE",
  "OXYGEN_SATURATION",
  "SLEEP_DURATION",
  "MEDICATION_ADHERENCE",
] as const;

export type HealthGoalType = (typeof healthGoalTypes)[number];
export type HealthGoalDirection = "AT_LEAST" | "AT_MOST" | "BETWEEN";
export type HealthGoalStatus = "ACTIVE" | "ACHIEVED" | "PAUSED" | "CANCELLED";

export interface HealthGoalProgress {
  id: string;
  value: number;
  secondaryValue: number | null;
  source: "MANUAL" | "AUTOMATIC";
  basis?: string | null;
  note: string | null;
  recordedAt: string;
  createdAt: string;
}

export interface HealthGoal {
  id: string;
  metric: HealthGoalType;
  title: string;
  direction: HealthGoalDirection;
  targetValue: number;
  targetSecondaryValue: number | null;
  unit: string;
  startDate: string;
  targetDate: string | null;
  status: HealthGoalStatus;
  progress: HealthGoalProgress[];
  currentProgress?: HealthGoalProgress | null;
  progressPercent?: number | null;
  isOnTrack?: boolean | null;
  remainingDays?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface HealthGoalInput {
  metric: HealthGoalType;
  title: string;
  direction: HealthGoalDirection;
  targetValue: number;
  targetSecondaryValue?: number | null;
  unit: string;
  startDate: string;
  targetDate?: string | null;
}

export interface UpdateHealthGoalInput extends Partial<HealthGoalInput> {
  status?: HealthGoalStatus;
}

export interface HealthGoalProgressInput {
  value: number;
  secondaryValue?: number | null;
  note?: string | null;
  recordedAt: string;
}

export const emergencySeverities = ["CONCERN", "URGENT", "CRITICAL"] as const;
export type EmergencySeverity = (typeof emergencySeverities)[number];

export interface EmergencyEvent {
  id: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  status: "ACTIVE" | "RESOLVED" | "CANCELLED";
  triggeredAt: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export interface EmergencyEventResult {
  event: EmergencyEvent;
  contacts: EmergencyContact[];
  recentReadings: EmergencyRecentReadings;
  notificationQueued: boolean;
  guidance: EmergencyGuidance;
}

export interface EmergencyReading {
  id: string;
  type?: string;
  metricType?: string;
  value: number;
  secondaryValue: number | null;
  unit: string;
  source?: string;
  measuredAt: string;
}

export interface EmergencyRecentReadings {
  measurements: EmergencyReading[];
  wearableMetrics: EmergencyReading[];
}

export interface EmergencyOverview {
  activeEvent: EmergencyEvent | null;
  items: EmergencyEvent[];
  contacts: EmergencyContact[];
  recentReadings: EmergencyRecentReadings;
  guidance: EmergencyGuidance;
}

export interface EmergencyGuidance {
  headline: string;
  instructions: string[];
  disclaimer: string;
}

export interface CreateEmergencyEventInput {
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DoctorNote {
  id: string;
  patientId: string;
  doctorId: string;
  title: string;
  content: string;
  category: string | null;
  appointmentId: string | null;
  createdAt: string;
  updatedAt: string;
  doctor: {
    id: string;
    specialization: string | null;
    user: { id: string; name: string; email: string };
  };
}

export interface CreateDoctorNoteInput {
  title: string;
  content: string;
  category?: string | null;
  appointmentId?: string | null;
}

export interface DoctorFollowUp {
  id: string;
  patientId: string;
  doctorId: string;
  summary: string;
  recommendations: string | null;
  occurredAt: string;
  followUpAt: string | null;
  appointmentId: string | null;
  createdAt: string;
  doctor: {
    id: string;
    specialization: string | null;
    user: { id: string; name: string; email: string };
  };
}

export interface CreateDoctorFollowUpInput {
  summary: string;
  recommendations?: string | null;
  occurredAt: string;
  followUpAt?: string | null;
  appointmentId?: string | null;
}

export interface UnusualChange {
  source: "MEASUREMENT" | "WEARABLE" | "ADHERENCE";
  metric: MeasurementType | HealthMetricType | "MEDICATION_ADHERENCE" | string;
  direction: "INCREASED" | "DECREASED";
  changePercent: number;
  observedAt: string;
  description: string;
}

export type PatientMonitoringReport = PatientHealthReport;

export interface DoctorMonitoringOverview {
  doctor: { id: string; user: { id: string; name: string; email: string } };
  period: { days: ReportPeriod; from: string; to: string };
  patients: Array<{
    patient: {
      id: string;
      timeZone: string | null;
      user: { id: string; name: string; email: string };
    };
    unusualChangeCount: number;
    unusualChanges: UnusualChange[];
    medicationAdherence: PatientHealthReport["medicationAdherence"];
    activeAlertCount: number;
    urgentAlertCount: number;
    activeEmergency: EmergencyEvent | null;
    latestMeasurements: Array<{
      type: string;
      unit: string;
      latest: number;
      latestAt: string;
      unusualChange: boolean;
    }>;
  }>;
  generatedAt: string;
  disclaimer: string;
}
