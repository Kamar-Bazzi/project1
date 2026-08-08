export const medicationStatuses = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

export const medicationLogStatuses = [
  "PENDING",
  "TAKEN",
  "MISSED",
  "SKIPPED",
] as const;

export type MedicationStatus = (typeof medicationStatuses)[number];
export type MedicationLogStatus =
  (typeof medicationLogStatuses)[number];
export type MedicationScheduleFrequency = "DAILY";

export interface MedicationSchedule {
  id: string;
  medicationId?: string;
  scheduledTime: string;
  frequency: MedicationScheduleFrequency;
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicationLog {
  id: string;
  medicationId?: string;
  patientId?: string;
  scheduledFor: string;
  takenAt: string | null;
  status: MedicationLogStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Medication {
  id: string;
  patientId?: string;
  timeZone: string;
  name: string;
  dosage: string;
  instructions: string | null;
  startDate: string;
  endDate: string | null;
  status: MedicationStatus;
  schedules: MedicationSchedule[];
  logs: MedicationLog[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MedicationInput {
  name: string;
  dosage: string;
  instructions: string | null;
  startDate: string;
  endDate: string | null;
  schedules: MedicationScheduleInput[];
}

export interface MedicationScheduleInput {
  scheduledTime: string;
  frequency: MedicationScheduleFrequency;
}

export type NewMedicationInput = MedicationInput;
export type UpdateMedicationInput = Partial<MedicationInput> & {
  status?: MedicationStatus;
};

export function formatEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function getPrimarySchedule(
  medication: Medication,
): MedicationSchedule | null {
  return medication.schedules[0] ?? null;
}

function utcDateKey(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function dateKeyInTimeZone(date: Date, timeZone: unknown): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (typeof timeZone === "string" && timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const year = parts.find((part) => part.type === "year")?.value;
      const month = parts.find((part) => part.type === "month")?.value;
      const day = parts.find((part) => part.type === "day")?.value;

      if (year && month && day) {
        return `${year}-${month}-${day}`;
      }
    } catch {
      // Malformed or legacy timezone values fall back to stable UTC behavior.
    }
  }

  return utcDateKey(date);
}

export function formatMedicationDoseTime(
  value: string,
  timeZone: unknown,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };

  if (typeof timeZone === "string" && timeZone) {
    try {
      return date.toLocaleTimeString([], { ...options, timeZone });
    } catch {
      // Malformed or legacy timezone values fall back to UTC below.
    }
  }

  return date.toLocaleTimeString([], { ...options, timeZone: "UTC" });
}

export function getTodaysMedicationLogs(
  medication: Medication,
  today = new Date(),
): MedicationLog[] {
  const todayKey = dateKeyInTimeZone(today, medication.timeZone);

  if (!todayKey) {
    return [];
  }

  return medication.logs
    .filter((log) => {
      const scheduledFor = new Date(log.scheduledFor);

      return (
        dateKeyInTimeZone(scheduledFor, medication.timeZone) === todayKey
      );
    })
    .sort(
      (first, second) =>
        Date.parse(first.scheduledFor) - Date.parse(second.scheduledFor),
    );
}

export function getTodaysMedicationLog(
  medication: Medication,
  today = new Date(),
): MedicationLog | null {
  const logs = getTodaysMedicationLogs(medication, today);
  return logs.length > 0 ? logs[logs.length - 1] : null;
}
