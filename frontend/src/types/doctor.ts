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
