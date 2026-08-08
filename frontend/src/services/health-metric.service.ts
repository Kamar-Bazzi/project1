import type {
  HealthMetric,
  HealthMetricFilters,
  HealthMetricInput,
} from "../types/health";
import api from "./api";

function compactFilters(filters: HealthMetricFilters): Record<string, string | number> {
  const parameters: Record<string, string | number> = {};

  if (filters.metricType) parameters.metricType = filters.metricType;
  if (filters.from) parameters.from = filters.from;
  if (filters.to) parameters.to = filters.to;
  if (filters.limit !== undefined) parameters.limit = filters.limit;

  return parameters;
}

function normalizeLatest(
  payload: HealthMetric[] | Record<string, HealthMetric | null>,
): HealthMetric[] {
  return Array.isArray(payload)
    ? payload
    : Object.values(payload).filter(
        (metric): metric is HealthMetric => metric !== null,
      );
}

export const healthMetricService = {
  async list(filters: HealthMetricFilters = {}): Promise<HealthMetric[]> {
    const response = await api.get<HealthMetric[]>("/health-metrics", {
      params: compactFilters(filters),
    });
    return response.data;
  },

  async latest(filters: HealthMetricFilters = {}): Promise<HealthMetric[]> {
    const response = await api.get<
      HealthMetric[] | Record<string, HealthMetric | null>
    >("/health-metrics/latest", { params: compactFilters(filters) });
    return normalizeLatest(response.data);
  },

  async history(filters: HealthMetricFilters): Promise<HealthMetric[]> {
    const response = await api.get<HealthMetric[]>("/health-metrics/history", {
      params: compactFilters(filters),
    });
    return response.data;
  },

  async create(input: HealthMetricInput): Promise<HealthMetric> {
    const response = await api.post<HealthMetric>("/health-metrics", input);
    return response.data;
  },

  async sync(
    wearableDeviceId: string,
    measurements: HealthMetricInput[],
  ): Promise<void> {
    await api.post("/health-metrics/sync", {
      wearableDeviceId,
      measurements,
    });
  },

  async syncDemo(wearableDeviceId: string): Promise<void> {
    await api.post("/health-metrics/demo-sync", { wearableDeviceId });
  },
};
