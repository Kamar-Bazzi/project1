import type { WearableDevice } from "../types/health";
import api from "./api";

export const wearableService = {
  async list(): Promise<WearableDevice[]> {
    const response = await api.get<WearableDevice[]>("/wearables");
    return response.data;
  },

  async get(deviceId: string): Promise<WearableDevice> {
    const response = await api.get<WearableDevice>(`/wearables/${deviceId}`);
    return response.data;
  },

  async connectDemo(): Promise<WearableDevice> {
    const response = await api.post<WearableDevice>("/wearables", {
      provider: "MOCK",
      deviceName: "CareTrack Demo Watch",
    });
    return response.data;
  },

  async update(
    deviceId: string,
    input: { deviceName?: string; active?: boolean },
  ): Promise<WearableDevice> {
    const response = await api.patch<WearableDevice>(
      `/wearables/${deviceId}`,
      input,
    );
    return response.data;
  },

  async disconnect(deviceId: string): Promise<void> {
    await api.delete(`/wearables/${deviceId}`);
  },
};
