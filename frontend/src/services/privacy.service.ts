import type {
  AccountDeletionRequest,
  PatientDataExportRequest,
  PatientExportDataset,
  PatientExportFormat,
} from "../types/privacy";
import api from "./api";

function fileName(disposition: string | undefined, fallback: string): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"$/, "")) : fallback;
}

export const privacyService = {
  async deletionStatus(): Promise<AccountDeletionRequest> {
    const response = await api.get<AccountDeletionRequest>(
      "/privacy/account-deletion",
    );
    return response.data;
  },

  async requestDeletion(currentPassword: string): Promise<AccountDeletionRequest> {
    const response = await api.post<AccountDeletionRequest>(
      "/privacy/account-deletion",
      { currentPassword, confirmation: "DELETE MY ACCOUNT" },
    );
    return response.data;
  },

  async cancelDeletion(currentPassword: string): Promise<AccountDeletionRequest> {
    const response = await api.post<AccountDeletionRequest>(
      "/privacy/account-deletion/cancel",
      { currentPassword },
    );
    return response.data;
  },

  async listExports(): Promise<PatientDataExportRequest[]> {
    const response = await api.get<PatientDataExportRequest[]>(
      "/privacy/data-exports",
    );
    return response.data;
  },

  async requestExport(input: {
    format: PatientExportFormat;
    dataset: PatientExportDataset;
    from?: string;
    to?: string;
  }): Promise<PatientDataExportRequest> {
    const response = await api.post<PatientDataExportRequest>(
      "/privacy/data-exports",
      input,
    );
    return response.data;
  },

  async downloadExport(
    request: PatientDataExportRequest,
  ): Promise<{ blob: Blob; fileName: string }> {
    const response = await api.get<Blob>(
      `/privacy/data-exports/${request.requestId}/download`,
      { responseType: "blob" },
    );
    return {
      blob: response.data,
      fileName: fileName(
        response.headers["content-disposition"],
        `patient-data-${request.dataset}.${request.format}`,
      ),
    };
  },

  async revokeExport(requestId: string): Promise<void> {
    await api.delete(`/privacy/data-exports/${requestId}`);
  },
};
