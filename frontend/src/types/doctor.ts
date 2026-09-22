import type { AppointmentStatus } from "./appointment";
import type {
  HealthAlertSeverity,
  HealthAlertStatus,
  HealthMetric,
  HealthMetricType,
} from "./health";
import type {
  MedicationLog,
  MedicationSchedule,
  MedicationStatus,
} from "./medication";
import type { Measurement, MeasurementType } from "./measurement";
import type {
  DoctorFollowUp,
  DoctorMonitoringOverview,
  DoctorNote,
  HealthGoal,
  MedicalHistoryResponse,
  PatientMonitoringReport,
} from "./care";
import type { FollowUpPlan } from "./follow-up-plan";
import type { PatientDocument } from "./patient-document";

export interface DoctorPatientUser {
  id: string;
  name: string;
  email: string;
}

export interface DoctorProfile {
  id: string;
  userId: string;
  specialization: string | null;
  licenseNumber: string | null;
  createdAt: string;
  updatedAt: string;
  user: DoctorPatientUser;
}

export interface DoctorPatientSummary {
  id: string;
  dateOfBirth: string | null;
  phoneNumber: string | null;
  timeZone: string | null;
  createdAt?: string;
  user: DoctorPatientUser;
  measurements?: Measurement[];
  healthAlerts?: DoctorHealthAlert[];
  appointments?: DoctorAppointment[];
  _count: {
    medications: number;
    measurements: number;
    healthAlerts: number;
    appointments: number;
  };
}

export interface PatientReference {
  id: string;
  user: DoctorPatientUser;
}

export interface DoctorHealthAlert {
  id: string;
  patientId: string;
  metricType: HealthMetricType;
  severity: HealthAlertSeverity;
  message: string;
  status: HealthAlertStatus;
  detectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  patient: PatientReference;
}

export interface DoctorMedication {
  id: string;
  patientId: string;
  name: string;
  dosage: string;
  instructions: string | null;
  startDate: string;
  endDate: string | null;
  status: MedicationStatus;
  schedules: MedicationSchedule[];
  logs: MedicationLog[];
  patient: PatientReference;
  updatedAt: string;
}

export interface DoctorMeasurement {
  id: string;
  patientId: string;
  type: MeasurementType;
  value: number;
  secondaryValue: number | null;
  unit: string;
  measuredAt: string;
  patient: PatientReference;
}

export interface DoctorAppointment {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentDate: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  patient: PatientReference & {
    dateOfBirth?: string | null;
    phoneNumber?: string | null;
  };
}

export interface DoctorDashboard {
  doctor: DoctorProfile;
  summary: {
    assignedPatients: number;
    activeAlerts: number;
    activeMedications: number;
    upcomingAppointments: number;
    missedMedicationDoses: number;
    patientsNeedingAttention: number;
  };
  patients: DoctorPatientSummary[];
  alerts: DoctorHealthAlert[];
  medications: DoctorMedication[];
  measurements: DoctorMeasurement[];
  appointments: DoctorAppointment[];
  recentMeasurements: DoctorMeasurement[];
  wearableAlerts: DoctorHealthAlert[];
  missedMedicationLogs: Array<{
    id: string;
    scheduledFor: string;
    status: "MISSED";
    medication: {
      id: string;
      patientId: string;
      name: string;
      dosage: string;
      patient: PatientReference;
    };
  }>;
  patientsNeedingAttention: Array<{
    id: string;
    user: DoctorPatientUser;
    healthAlerts: Array<{
      id: string;
      severity: HealthAlertSeverity;
      message: string;
      detectedAt: string;
    }>;
    emergencyEvents: Array<{ id: string; triggeredAt: string }>;
    medications: Array<{
      id: string;
      name: string;
      logs: Array<{ id: string }>;
    }>;
  }>;
}

export type DoctorPatient = DoctorPatientSummary;
export type DoctorPatientDetail = DoctorPatientRecord;
export type DoctorAlert = DoctorHealthAlert;
export type DoctorMonitoring = DoctorMonitoringOverview;
export type ClinicalNote = DoctorNote;
export type FollowUp = DoctorFollowUp;
export type DoctorPatientGoal = HealthGoal;
export type PatientDocumentForDoctor = PatientDocument;

export interface DoctorAvailabilityWindow {
  id?: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface DoctorAvailability {
  id: string;
  userId: string;
  timeZone: string;
  slotDurationMinutes: number;
  availabilityWindows: DoctorAvailabilityWindow[];
}

export interface UpdateDoctorAvailabilityInput {
  timeZone: string;
  slotDurationMinutes: number;
  windows: DoctorAvailabilityWindow[];
}

export interface DoctorPatientSymptom {
  id: string;
  patientId: string;
  name: string;
  severity: number;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorCheckIn {
  id: string;
  patientId: string;
  localDate: string;
  timeZone: string;
  mood: number;
  painLevel: number;
  sleepQuality: number;
  symptoms: string[];
  notes: string | null;
  activityMinutes: number;
  medicationAdherence: string;
  createdAt: string;
  updatedAt: string;
}

export type DoctorPatientMedicalHistory = MedicalHistoryResponse;
export type DoctorPatientMonitoring = PatientMonitoringReport;
export type DoctorFollowUpPlan = FollowUpPlan;

export interface DoctorPatientRecord {
  id: string;
  dateOfBirth: string | null;
  phoneNumber: string | null;
  emergencyContact: string | null;
  timeZone: string | null;
  createdAt: string;
  updatedAt: string;
  user: DoctorPatientUser;
  medications: Array<Omit<DoctorMedication, "patient">>;
  measurements: Measurement[];
  healthAlerts: Array<Omit<DoctorHealthAlert, "patient">>;
  healthMetrics: HealthMetric[];
  appointments: Array<Omit<DoctorAppointment, "patient">>;
}

export interface PaginatedDoctorResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
