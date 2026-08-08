import type {
  Measurement,
  MeasurementInput,
  UpdateMeasurementInput,
} from "../types/measurement";
import api from "./api";

export const measurementService = {
  async list(): Promise<Measurement[]> {
    const response = await api.get<Measurement[]>("/measurements");
    return response.data;
  },

  async get(measurementId: string): Promise<Measurement> {
    const response = await api.get<Measurement>(
      `/measurements/${measurementId}`,
    );
    return response.data;
  },

  async create(input: MeasurementInput): Promise<Measurement> {
    const response = await api.post<Measurement>("/measurements", input);
    return response.data;
  },

  async update(
    measurementId: string,
    input: UpdateMeasurementInput,
  ): Promise<Measurement> {
    const response = await api.patch<Measurement>(
      `/measurements/${measurementId}`,
      input,
    );
    return response.data;
  },

  async remove(measurementId: string): Promise<void> {
    await api.delete(`/measurements/${measurementId}`);
  },
};
