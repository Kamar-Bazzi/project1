import type {
  ClinicalNote,
  DoctorAlert,
  DoctorAppointment,
  DoctorAvailability,
  DoctorDashboard,
  DoctorFollowUpPlan,
  DoctorHealthAlert,
  DoctorMonitoring,
  DoctorPatient,
  DoctorPatientGoal,
  DoctorPatientMedicalHistory,
  DoctorPatientMonitoring,
  DoctorPatientRecord,
  DoctorPatientSummary,
  DoctorPatientSymptom,
  DoctorCheckIn,
  FollowUp,
  PaginatedDoctorResponse,
  PatientDocumentForDoctor,
  UpdateDoctorAvailabilityInput,
} from "../types/doctor";
import type {
  CreateDoctorFollowUpInput,
  CreateDoctorNoteInput,
  ReportPeriod,
} from "../types/care";
import type {
  CreateFollowUpPlanInput,
  CreateFollowUpTaskInput,
  FollowUpTask,
  UpdateFollowUpPlanInput,
  UpdateFollowUpTaskInput,
} from "../types/follow-up-plan";
import api from "./api";

interface ItemList<T> {
  items: T[];
}

function items<T>(value: T[] | ItemList<T>): T[] {
  return Array.isArray(value) ? value : value.items;
}

export const doctorService = {
  async dashboard(): Promise<DoctorDashboard> {
    const response = await api.get<DoctorDashboard>("/doctor/dashboard");
    return response.data;
  },

  async listPatients(search?: string): Promise<PaginatedDoctorResponse<DoctorPatient>> {
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

  async listAppointments(): Promise<DoctorAppointment[]> {
    const response = await api.get<PaginatedDoctorResponse<DoctorAppointment>>(
      "/doctor/appointments",
      { params: { pageSize: 100 } },
    );
    return response.data.items;
  },

  async listAlerts(): Promise<PaginatedDoctorResponse<DoctorAlert>> {
    const response = await api.get<PaginatedDoctorResponse<DoctorHealthAlert>>(
      "/doctor/alerts",
      { params: { pageSize: 100 } },
    );
    return response.data;
  },

  async monitoring(period: ReportPeriod = 30): Promise<DoctorMonitoring> {
    const response = await api.get<DoctorMonitoring>("/doctor/monitoring", {
      params: { period },
    });
    return response.data;
  },

  async getAvailability(): Promise<DoctorAvailability> {
    const response = await api.get<DoctorAvailability>("/doctor/availability");
    return response.data;
  },

  async updateAvailability(
    input: UpdateDoctorAvailabilityInput,
  ): Promise<DoctorAvailability> {
    const response = await api.put<DoctorAvailability>(
      "/doctor/availability",
      input,
    );
    return response.data;
  },

  async getMedicalHistory(
    patientId: string,
    period: ReportPeriod = 30,
  ): Promise<DoctorPatientMedicalHistory> {
    const response = await api.get<DoctorPatientMedicalHistory>(
      `/doctor/patients/${patientId}/medical-history`,
      { params: { period, page: 1, pageSize: 50 } },
    );
    return response.data;
  },

  async getSymptoms(patientId: string): Promise<DoctorPatientSymptom[]> {
    const response = await api.get<DoctorPatientSymptom[]>(
      `/doctor/patients/${patientId}/symptoms`,
    );
    return response.data;
  },

  async getGoals(patientId: string): Promise<DoctorPatientGoal[]> {
    const response = await api.get<DoctorPatientGoal[] | ItemList<DoctorPatientGoal>>(
      `/doctor/patients/${patientId}/goals`,
    );
    return items(response.data);
  },

  async getNotes(patientId: string): Promise<ClinicalNote[]> {
    const response = await api.get<ClinicalNote[] | ItemList<ClinicalNote>>(
      `/doctor/patients/${patientId}/notes`,
    );
    return items(response.data);
  },

  async createNote(
    patientId: string,
    input: CreateDoctorNoteInput,
  ): Promise<ClinicalNote> {
    const response = await api.post<ClinicalNote>(
      `/doctor/patients/${patientId}/notes`,
      input,
    );
    return response.data;
  },

  async updateNote(
    patientId: string,
    noteId: string,
    input: Partial<CreateDoctorNoteInput>,
  ): Promise<ClinicalNote> {
    const response = await api.patch<ClinicalNote>(
      `/doctor/patients/${patientId}/notes/${noteId}`,
      input,
    );
    return response.data;
  },

  async getFollowUps(patientId: string): Promise<FollowUp[]> {
    const response = await api.get<FollowUp[] | ItemList<FollowUp>>(
      `/doctor/patients/${patientId}/follow-ups`,
    );
    return items(response.data);
  },

  async createFollowUp(
    patientId: string,
    input: CreateDoctorFollowUpInput,
  ): Promise<FollowUp> {
    const response = await api.post<FollowUp>(
      `/doctor/patients/${patientId}/follow-ups`,
      input,
    );
    return response.data;
  },

  async getFollowUpPlans(patientId: string): Promise<DoctorFollowUpPlan[]> {
    const response = await api.get<DoctorFollowUpPlan[] | ItemList<DoctorFollowUpPlan>>(
      `/doctor/patients/${patientId}/follow-up-plans`,
      { params: { pageSize: 100 } },
    );
    return items(response.data);
  },

  async createFollowUpPlan(
    patientId: string,
    input: CreateFollowUpPlanInput,
  ): Promise<DoctorFollowUpPlan> {
    const response = await api.post<DoctorFollowUpPlan>(
      `/doctor/patients/${patientId}/follow-up-plans`,
      input,
    );
    return response.data;
  },

  async updateFollowUpPlan(
    patientId: string,
    planId: string,
    input: UpdateFollowUpPlanInput,
  ): Promise<DoctorFollowUpPlan> {
    const response = await api.patch<DoctorFollowUpPlan>(
      `/doctor/patients/${patientId}/follow-up-plans/${planId}`,
      input,
    );
    return response.data;
  },

  async addFollowUpTask(
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

  async updateFollowUpTask(
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

  async getDocuments(patientId: string): Promise<PatientDocumentForDoctor[]> {
    const response = await api.get<PatientDocumentForDoctor[] | ItemList<PatientDocumentForDoctor>>(
      `/doctor/patients/${patientId}/documents`,
    );
    return items(response.data);
  },

  async getPatientMonitoring(
    patientId: string,
    period: ReportPeriod = 30,
  ): Promise<DoctorPatientMonitoring> {
    const response = await api.get<DoctorPatientMonitoring>(
      `/doctor/patients/${patientId}/monitoring`,
      { params: { period } },
    );
    return response.data;
  },

  async getPatientCheckIns(patientId: string): Promise<DoctorCheckIn[]> {
    const response = await api.get<DoctorCheckIn[]>(
      `/doctor/patients/${patientId}/check-ins`,
      { params: { limit: 30 } },
    );
    return response.data;
  },

  async getPatientTodayCheckIn(patientId: string): Promise<DoctorCheckIn | null> {
    const response = await api.get<DoctorCheckIn | null>(
      `/doctor/patients/${patientId}/check-ins/today`,
    );
    return response.data;
  },
};
