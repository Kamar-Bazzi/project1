import type {
  CreateDoctorNoteInput,
  CreateDoctorFollowUpInput,
  CreateEmergencyEventInput,
  DoctorMonitoringOverview,
  DoctorNote,
  DoctorFollowUp,
  EmergencyEvent,
  EmergencyEventResult,
  EmergencyOverview,
  HealthGoal,
  HealthGoalInput,
  HealthGoalProgress,
  HealthGoalProgressInput,
  MedicalHistoryResponse,
  MedicalHistoryType,
  PatientHealthReport,
  PatientMonitoringReport,
  ReportPeriod,
  UpdateHealthGoalInput,
} from "../types/care";
import api from "./api";

interface ItemList<T> {
  items: T[];
}

export type ClinicalExportDataset =
  | "medical-history"
  | "measurements"
  | "appointments"
  | "adherence"
  | "wearables";

export type ClinicalExportFormat = "csv" | "pdf";

interface ClinicalExportOptions {
  patientId?: string;
  from?: string;
  to?: string;
}

function fileNameFromDisposition(
  disposition: string | undefined,
  fallback: string,
): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"$/, "")) : fallback;
}

export const careService = {
  async medicalHistory(options: {
    period: ReportPeriod;
    types?: MedicalHistoryType[];
    page?: number;
    pageSize?: number;
  }): Promise<MedicalHistoryResponse> {
    const response = await api.get<MedicalHistoryResponse>("/medical-history", {
      params: {
        ...options,
        types: options.types?.join(",") || undefined,
      },
    });
    return response.data;
  },

  async doctorMedicalHistory(
    patientId: string,
    options: {
      period: ReportPeriod;
      types?: MedicalHistoryType[];
      page?: number;
      pageSize?: number;
    },
  ): Promise<MedicalHistoryResponse> {
    const response = await api.get<MedicalHistoryResponse>(
      `/doctor/patients/${patientId}/medical-history`,
      {
        params: {
          ...options,
          types: options.types?.join(",") || undefined,
        },
      },
    );
    return response.data;
  },

  async report(period: ReportPeriod): Promise<PatientHealthReport> {
    const response = await api.get<PatientHealthReport>("/reports/health", {
      params: { period },
    });
    return response.data;
  },

  async downloadReport(
    period: ReportPeriod,
    format: ClinicalExportFormat,
  ): Promise<{ blob: Blob; fileName: string }> {
    const response = await api.get<Blob>("/reports/health/export", {
      params: { period, format },
      responseType: "blob",
    });
    return {
      blob: response.data,
      fileName: fileNameFromDisposition(
        response.headers["content-disposition"],
        `caretrack-health-report-${period}-days.${format}`,
      ),
    };
  },

  async downloadDataset(
    dataset: ClinicalExportDataset,
    format: ClinicalExportFormat,
    options: ClinicalExportOptions = {},
  ): Promise<{ blob: Blob; fileName: string }> {
    const response = await api.get<Blob>(`/exports/${dataset}`, {
      params: { format, ...options },
      responseType: "blob",
    });
    return {
      blob: response.data,
      fileName: fileNameFromDisposition(
        response.headers["content-disposition"],
        `caretrack-${dataset}.${format}`,
      ),
    };
  },

  async listGoals(): Promise<HealthGoal[]> {
    const response = await api.get<HealthGoal[] | ItemList<HealthGoal>>(
      "/health-goals",
    );
    return Array.isArray(response.data) ? response.data : response.data.items;
  },

  async createGoal(input: HealthGoalInput): Promise<HealthGoal> {
    const response = await api.post<HealthGoal>("/health-goals", input);
    return response.data;
  },

  async updateGoal(
    goalId: string,
    input: UpdateHealthGoalInput,
  ): Promise<HealthGoal> {
    const response = await api.patch<HealthGoal>(
      `/health-goals/${goalId}`,
      input,
    );
    return response.data;
  },

  async removeGoal(goalId: string): Promise<void> {
    await api.delete(`/health-goals/${goalId}`);
  },

  async recordGoalProgress(
    goalId: string,
    input: HealthGoalProgressInput,
  ): Promise<HealthGoalProgress> {
    const response = await api.post<HealthGoalProgress>(
      `/health-goals/${goalId}/progress`,
      input,
    );
    return response.data;
  },

  async emergencyOverview(): Promise<EmergencyOverview> {
    const response = await api.get<EmergencyOverview>("/emergency-events");
    return response.data;
  },

  async createEmergencyEvent(
    input: CreateEmergencyEventInput,
  ): Promise<EmergencyEventResult> {
    const response = await api.post<EmergencyEventResult>(
      "/emergency-events",
      input,
    );
    return response.data;
  },

  async resolveEmergencyEvent(eventId: string): Promise<EmergencyEvent> {
    const response = await api.patch<{ event: EmergencyEvent }>(
      `/emergency-events/${eventId}/resolve`,
    );
    return response.data.event;
  },

  async listDoctorNotes(patientId: string): Promise<DoctorNote[]> {
    const response = await api.get<DoctorNote[] | ItemList<DoctorNote>>(
      `/doctor/patients/${patientId}/notes`,
    );
    return Array.isArray(response.data) ? response.data : response.data.items;
  },

  async createDoctorNote(
    patientId: string,
    input: CreateDoctorNoteInput,
  ): Promise<DoctorNote> {
    const response = await api.post<DoctorNote>(
      `/doctor/patients/${patientId}/notes`,
      input,
    );
    return response.data;
  },

  async listDoctorFollowUps(patientId: string): Promise<DoctorFollowUp[]> {
    const response = await api.get<
      DoctorFollowUp[] | ItemList<DoctorFollowUp>
    >(`/doctor/patients/${patientId}/follow-ups`);
    return Array.isArray(response.data) ? response.data : response.data.items;
  },

  async createDoctorFollowUp(
    patientId: string,
    input: CreateDoctorFollowUpInput,
  ): Promise<DoctorFollowUp> {
    const response = await api.post<DoctorFollowUp>(
      `/doctor/patients/${patientId}/follow-ups`,
      input,
    );
    return response.data;
  },

  async doctorMonitoring(
    period: ReportPeriod,
  ): Promise<DoctorMonitoringOverview> {
    const response = await api.get<DoctorMonitoringOverview>(
      "/doctor/monitoring",
      { params: { period } },
    );
    return response.data;
  },

  async patientMonitoring(
    patientId: string,
    period: ReportPeriod,
  ): Promise<PatientMonitoringReport> {
    const response = await api.get<PatientMonitoringReport>(
      `/doctor/patients/${patientId}/monitoring`,
      { params: { period } },
    );
    return response.data;
  },
};
