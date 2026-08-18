import type {
  DoctorDashboard,
  DoctorHealthAlert,
  DoctorPatientRecord,
  DoctorPatientSummary,
  PaginatedDoctorResponse,
} from "../types/doctor";
import api from "./api";

export const doctorService = {
  async dashboard(): Promise<DoctorDashboard> {
    const response = await api.get<DoctorDashboard>("/doctor/dashboard");
    return response.data;
  },

  async listPatients(
    search?: string,
  ): Promise<PaginatedDoctorResponse<DoctorPatientSummary>> {
    const response = await api.get<PaginatedDoctorResponse<DoctorPatientSummary>>(
      "/doctor/patients",
      { params: { pageSize: 100, search: search || undefined } },
    );
    return response.data;
  },

  async getPatient(patientId: string): Promise<DoctorPatientRecord> {
    const response = await api.get<DoctorPatientRecord>(
      `/doctor/patients/${patientId}`,
    );
    return response.data;
  },

  async listAlerts(): Promise<PaginatedDoctorResponse<DoctorHealthAlert>> {
    const response = await api.get<PaginatedDoctorResponse<DoctorHealthAlert>>(
      "/doctor/alerts",
      { params: { pageSize: 100 } },
    );
    return response.data;
  },
};
