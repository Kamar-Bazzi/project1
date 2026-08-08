import type {
  AlertRule,
  AlertRuleInput,
  HealthAlert,
  HealthAlertStatus,
} from "../types/health";
import api from "./api";

export const healthAlertService = {
  async list(
    status?: HealthAlertStatus,
    limit = 100,
  ): Promise<HealthAlert[]> {
    const response = await api.get<HealthAlert[]>("/health-alerts", {
      params: { status, limit },
    });
    return response.data;
  },

  async acknowledge(alertId: string): Promise<HealthAlert> {
    const response = await api.patch<HealthAlert>(
      `/health-alerts/${alertId}/acknowledge`,
    );
    return response.data;
  },

  async resolve(alertId: string): Promise<HealthAlert> {
    const response = await api.patch<HealthAlert>(
      `/health-alerts/${alertId}/resolve`,
    );
    return response.data;
  },
};

export const alertRuleService = {
  async list(): Promise<AlertRule[]> {
    const response = await api.get<AlertRule[]>("/alert-rules");
    return response.data;
  },

  async create(input: AlertRuleInput): Promise<AlertRule> {
    const response = await api.post<AlertRule>("/alert-rules", input);
    return response.data;
  },

  async update(ruleId: string, input: Partial<AlertRuleInput>): Promise<AlertRule> {
    const response = await api.patch<AlertRule>(`/alert-rules/${ruleId}`, input);
    return response.data;
  },

  async remove(ruleId: string): Promise<void> {
    await api.delete(`/alert-rules/${ruleId}`);
  },
};
