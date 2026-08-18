export const appointmentStatuses = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type AppointmentStatus = (typeof appointmentStatuses)[number];

export interface AppointmentUser {
  id: string;
  name: string;
  email: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentDate: string;
  status: AppointmentStatus;
  notes: string | null;
  patient: {
    id: string;
    dateOfBirth: string | null;
    phoneNumber: string | null;
    timeZone: string | null;
    user: AppointmentUser;
  };
  doctor: {
    id: string;
    specialization: string | null;
    licenseNumber: string | null;
    user: AppointmentUser;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentInput {
  doctorId: string;
  appointmentDate: string;
  notes?: string | null;
}

export interface DoctorAppointmentInput {
  patientId: string;
  appointmentDate: string;
  notes?: string | null;
}

export interface UpdateAppointmentInput {
  appointmentDate?: string;
  status?: AppointmentStatus;
  notes?: string | null;
}

export interface AppointmentDoctor {
  id: string;
  specialization: string | null;
  licenseNumber: string | null;
  user: AppointmentUser;
}

export function formatAppointmentStatus(status: AppointmentStatus): string {
  return `${status.charAt(0)}${status.slice(1).toLowerCase()}`;
}
