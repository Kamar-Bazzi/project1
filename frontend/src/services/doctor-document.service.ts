import api from "./api";
import type { PatientDocument } from "../types/patient-document";

interface ItemList<T> {
  items: T[];
}

function fileNameFromDisposition(
  disposition: string | undefined,
  fallback: string,
): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback;
    }
  }

  return disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

export const doctorDocumentService = {
  async list(patientId: string): Promise<PatientDocument[]> {
    const response = await api.get<
      PatientDocument[] | ItemList<PatientDocument>
    >(`/doctor/patients/${patientId}/documents`);
    return Array.isArray(response.data) ? response.data : response.data.items;
  },

  async download(
    patientId: string,
    documentId: string,
    fallbackFileName: string,
  ): Promise<{ blob: Blob; fileName: string }> {
    const response = await api.get<Blob>(
      `/doctor/patients/${patientId}/documents/${documentId}/download`,
      { responseType: "blob", timeout: 30_000 },
    );
    return {
      blob: response.data,
      fileName: fileNameFromDisposition(
        response.headers["content-disposition"],
        fallbackFileName,
      ),
    };
  },
};
