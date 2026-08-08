import type {
  PatientProfile,
  UpdatePatientProfileInput,
} from "../types/patient";
import api from "./api";

export const patientService = {
  async getProfile(): Promise<PatientProfile> {
    const response = await api.get<PatientProfile>("/patients/me");
    return response.data;
  },

  async updateProfile(
    input: UpdatePatientProfileInput,
  ): Promise<PatientProfile> {
    const response = await api.patch<PatientProfile>(
      "/patients/me",
      input,
    );
    return response.data;
  },
};
