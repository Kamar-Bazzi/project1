import type {
  Medication,
  MedicationInput,
  MedicationLog,
  MedicationLogStatus,
  UpdateMedicationInput,
} from "../types/medication";
import api from "./api";

export const medicationService = {
  async list(): Promise<Medication[]> {
    const response = await api.get<Medication[]>("/medications");
    return response.data;
  },

  async get(medicationId: string): Promise<Medication> {
    const response = await api.get<Medication>(
      `/medications/${medicationId}`,
    );
    return response.data;
  },

  async create(input: MedicationInput): Promise<Medication> {
    const response = await api.post<Medication>("/medications", input);
    return response.data;
  },

  async update(
    medicationId: string,
    input: UpdateMedicationInput,
  ): Promise<Medication> {
    const response = await api.patch<Medication>(
      `/medications/${medicationId}`,
      input,
    );
    return response.data;
  },

  async remove(medicationId: string): Promise<void> {
    await api.delete(`/medications/${medicationId}`);
  },

  async updateLogStatus(
    medicationId: string,
    logId: string,
    status: MedicationLogStatus,
  ): Promise<MedicationLog> {
    const response = await api.patch<MedicationLog>(
      `/medications/${medicationId}/logs/${logId}/status`,
      { status },
    );
    return response.data;
  },
};
