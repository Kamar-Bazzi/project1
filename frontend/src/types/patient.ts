export interface PatientProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  timeZone: string | null;
  dateOfBirth: string | null;
  phoneNumber: string | null;
  emergencyContact: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePatientProfileInput {
  name: string;
  timeZone: string;
  dateOfBirth: string | null;
  phoneNumber: string | null;
  emergencyContact: string | null;
}
