export type MedicationStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export type MedicationLogStatus =
  | "PENDING"
  | "TAKEN"
  | "MISSED"
  | "SKIPPED";

export interface MedicationSchedule {
  id: string;
  scheduledTime: string;
  frequency: string;
}

export interface MedicationLog {
  id: string;
  scheduledFor: string;
  takenAt: string | null;
  status: MedicationLogStatus;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  instructions: string | null;
  startDate: string;
  endDate: string | null;
  status: MedicationStatus;
  schedules: MedicationSchedule[];
  logs: MedicationLog[];
}

export interface NewMedicationInput {
  name: string;
  dosage: string;
  instructions: string | null;
  scheduledTime: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
}

export function getPrimarySchedule(
  medication: Medication,
): MedicationSchedule | null {
  return medication.schedules[0] ?? null;
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function getTodaysMedicationLog(
  medication: Medication,
  today = new Date(),
): MedicationLog | null {
  const todayKey = localDateKey(today);

  return medication.logs.reduce<MedicationLog | null>(
    (latestLog, currentLog) => {
      const scheduledFor = new Date(currentLog.scheduledFor);

      if (
        Number.isNaN(scheduledFor.getTime()) ||
        localDateKey(scheduledFor) !== todayKey
      ) {
        return latestLog;
      }

      if (!latestLog) {
        return currentLog;
      }

      return Date.parse(currentLog.scheduledFor) >
        Date.parse(latestLog.scheduledFor)
        ? currentLog
        : latestLog;
    },
    null,
  );
}
