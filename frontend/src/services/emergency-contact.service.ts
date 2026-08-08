import type {
  EmergencyContact,
  EmergencyContactInput,
} from "../types/health";
import api from "./api";

export const emergencyContactService = {
  async list(): Promise<EmergencyContact[]> {
    const response = await api.get<EmergencyContact[]>("/emergency-contacts");
    return response.data;
  },

  async create(input: EmergencyContactInput): Promise<EmergencyContact> {
    const response = await api.post<EmergencyContact>(
      "/emergency-contacts",
      input,
    );
    return response.data;
  },

  async update(
    contactId: string,
    input: Partial<EmergencyContactInput>,
  ): Promise<EmergencyContact> {
    const response = await api.patch<EmergencyContact>(
      `/emergency-contacts/${contactId}`,
      input,
    );
    return response.data;
  },

  async remove(contactId: string): Promise<void> {
    await api.delete(`/emergency-contacts/${contactId}`);
  },
};
