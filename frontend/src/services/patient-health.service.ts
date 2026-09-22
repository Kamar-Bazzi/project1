import type {
  DailyHealthCheckIn,
  DailyHealthCheckInInput,
  SymptomEntry,
  SymptomInput,
  WellnessDashboard,
} from "../types/patient-health";
import type {
  PatientDocument,
  PatientDocumentCategory,
} from "../types/patient-document";
import api from "./api";

interface ItemList<T> {
  items: T[];
}

function unwrapItems<T>(value: T[] | ItemList<T>): T[] {
  return Array.isArray(value) ? value : value.items;
}

function fileNameFromDisposition(
  disposition: string | undefined,
  fallback: string,
): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  if (!match) return fallback;

  try {
    return decodeURIComponent(match[1].replace(/"$/, ""));
  } catch {
    return fallback;
  }
}

export const wellnessService = {
  async summary(): Promise<WellnessDashboard> {
    const response = await api.get<WellnessDashboard>("/wellness/summary");
    return response.data;
  },
};

export const symptomService = {
  async list(): Promise<SymptomEntry[]> {
    const response = await api.get<SymptomEntry[] | ItemList<SymptomEntry>>(
      "/symptoms",
    );
    return unwrapItems(response.data);
  },

  async create(input: SymptomInput): Promise<SymptomEntry> {
    const response = await api.post<SymptomEntry>("/symptoms", input);
    return response.data;
  },

  async update(id: string, input: Partial<SymptomInput>): Promise<SymptomEntry> {
    const response = await api.patch<SymptomEntry>(`/symptoms/${id}`, input);
    return response.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/symptoms/${id}`);
  },
};

export const checkInService = {
  async list(): Promise<DailyHealthCheckIn[]> {
    const response = await api.get<
      DailyHealthCheckIn[] | ItemList<DailyHealthCheckIn>
    >("/check-ins");
    return unwrapItems(response.data);
  },

  async today(): Promise<DailyHealthCheckIn | null> {
    const response = await api.get<DailyHealthCheckIn | null>(
      "/check-ins/today",
      { validateStatus: (status) => status === 404 || (status >= 200 && status < 300) },
    );
    return response.status === 404 ? null : response.data;
  },

  async saveToday(input: DailyHealthCheckInInput): Promise<DailyHealthCheckIn> {
    const response = await api.put<DailyHealthCheckIn>(
      "/check-ins/today",
      input,
    );
    return response.data;
  },
};

export const patientDocumentService = {
  async list(): Promise<PatientDocument[]> {
    const response = await api.get<
      PatientDocument[] | ItemList<PatientDocument>
    >("/documents");
    return unwrapItems(response.data);
  },

  async upload(input: {
    category: PatientDocumentCategory;
    title: string;
    description?: string | null;
    documentDate?: string | null;
    file: File;
  }): Promise<PatientDocument> {
    const body = new FormData();
    body.append("category", input.category);
    body.append("title", input.title);
    if (input.description) body.append("description", input.description);
    if (input.documentDate) body.append("documentDate", input.documentDate);
    body.append("file", input.file);
    const response = await api.post<PatientDocument>("/documents", body, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30_000,
    });
    return response.data;
  },

  async download(
    document: PatientDocument,
  ): Promise<{ blob: Blob; fileName: string }> {
    const response = await api.get<Blob>(`/documents/${document.id}/download`, {
      responseType: "blob",
      timeout: 30_000,
    });
    return {
      blob: response.data,
      fileName: fileNameFromDisposition(
        response.headers["content-disposition"],
        document.originalFileName,
      ),
    };
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/documents/${id}`);
  },
};
