import api from "./api";
import type {
  CreateFollowUpPlanInput,
  CreateFollowUpTaskInput,
  FollowUpPlan,
  FollowUpTask,
  UpdateFollowUpPlanInput,
  UpdateFollowUpTaskInput,
} from "../types/follow-up-plan";

interface ItemList<T> {
  items: T[];
  pagination?: {
    page: number;
    totalPages: number;
  };
}

export const doctorFollowUpService = {
  async list(patientId: string): Promise<FollowUpPlan[]> {
    const endpoint = `/doctor/patients/${patientId}/follow-up-plans`;
    const firstResponse = await api.get<FollowUpPlan[] | ItemList<FollowUpPlan>>(
      endpoint,
      { params: { page: 1, pageSize: 100 } },
    );
    if (Array.isArray(firstResponse.data)) return firstResponse.data;

    const plans = [...firstResponse.data.items];
    const totalPages = firstResponse.data.pagination?.totalPages ?? 1;
    for (let page = 2; page <= totalPages; page += 1) {
      const response = await api.get<ItemList<FollowUpPlan>>(endpoint, {
        params: { page, pageSize: 100 },
      });
      plans.push(...response.data.items);
    }
    return plans;
  },

  async create(
    patientId: string,
    input: CreateFollowUpPlanInput,
  ): Promise<FollowUpPlan> {
    const response = await api.post<FollowUpPlan>(
      `/doctor/patients/${patientId}/follow-up-plans`,
      input,
    );
    return response.data;
  },

  async update(
    patientId: string,
    planId: string,
    input: UpdateFollowUpPlanInput,
  ): Promise<FollowUpPlan> {
    const response = await api.patch<FollowUpPlan>(
      `/doctor/patients/${patientId}/follow-up-plans/${planId}`,
      input,
    );
    return response.data;
  },

  async createTask(
    patientId: string,
    planId: string,
    input: CreateFollowUpTaskInput,
  ): Promise<FollowUpTask> {
    const response = await api.post<FollowUpTask>(
      `/doctor/patients/${patientId}/follow-up-plans/${planId}/tasks`,
      input,
    );
    return response.data;
  },

  async updateTask(
    patientId: string,
    planId: string,
    taskId: string,
    input: UpdateFollowUpTaskInput,
  ): Promise<FollowUpTask> {
    const response = await api.patch<FollowUpTask>(
      `/doctor/patients/${patientId}/follow-up-plans/${planId}/tasks/${taskId}`,
      input,
    );
    return response.data;
  },
};
