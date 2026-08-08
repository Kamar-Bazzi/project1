import { seedMedications } from "../mocks/medications";
import type {
  Medication,
  MedicationLog,
  MedicationLogStatus,
  MedicationSchedule,
  MedicationStatus,
  NewMedicationInput,
} from "../types/medication";

const STORAGE_KEY_PREFIX = "medical-tracking.medications.v1";
const STORAGE_VERSION = 1;

const medicationStatuses: readonly MedicationStatus[] = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
];
const medicationLogStatuses: readonly MedicationLogStatus[] = [
  "PENDING",
  "TAKEN",
  "MISSED",
  "SKIPPED",
];

interface PersistedMedicationState {
  version: number;
  medications: Medication[];
}

interface UserMedicationStore {
  medications: Medication[];
  listeners: Set<MedicationStoreListener>;
}

type MedicationStoreListener = () => void;

const userStores = new Map<string, UserMedicationStore>();

function storageKeyForUser(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isMedicationSchedule(
  value: unknown,
): value is MedicationSchedule {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.scheduledTime === "string" &&
    typeof value.frequency === "string"
  );
}

function isMedicationLog(value: unknown): value is MedicationLog {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.scheduledFor === "string" &&
    isNullableString(value.takenAt) &&
    medicationLogStatuses.includes(
      value.status as MedicationLogStatus,
    )
  );
}

function isMedication(value: unknown): value is Medication {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.dosage === "string" &&
    isNullableString(value.instructions) &&
    typeof value.startDate === "string" &&
    isNullableString(value.endDate) &&
    medicationStatuses.includes(value.status as MedicationStatus) &&
    Array.isArray(value.schedules) &&
    value.schedules.every(isMedicationSchedule) &&
    Array.isArray(value.logs) &&
    value.logs.every(isMedicationLog)
  );
}

function cloneSeedMedications(): Medication[] {
  return seedMedications.map((medication) => ({
    ...medication,
    schedules: medication.schedules.map((schedule) => ({
      ...schedule,
    })),
    logs: medication.logs.map((log) => ({ ...log })),
  }));
}

function parseStoredMedications(rawState: string): Medication[] | null {
  try {
    const parsedState: unknown = JSON.parse(rawState);

    if (
      !isRecord(parsedState) ||
      parsedState.version !== STORAGE_VERSION ||
      !Array.isArray(parsedState.medications) ||
      !parsedState.medications.every(isMedication)
    ) {
      return null;
    }

    return parsedState.medications;
  } catch {
    return null;
  }
}

function readStoredMedications(userId: string): Medication[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawState = window.localStorage.getItem(
      storageKeyForUser(userId),
    );

    return rawState ? parseStoredMedications(rawState) : null;
  } catch {
    return null;
  }
}

function createId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toIsoDate(dateValue: string): string {
  return new Date(`${dateValue}T00:00:00`).toISOString();
}

function scheduledForToday(scheduledTime: string): Date | null {
  const [hours, minutes] = scheduledTime.split(":").map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const scheduledFor = new Date();
  scheduledFor.setHours(hours, minutes, 0, 0);

  return scheduledFor;
}

function isSameScheduledDose(
  log: MedicationLog,
  scheduledFor: Date,
): boolean {
  const logDate = new Date(log.scheduledFor);

  return (
    !Number.isNaN(logDate.getTime()) &&
    logDate.getFullYear() === scheduledFor.getFullYear() &&
    logDate.getMonth() === scheduledFor.getMonth() &&
    logDate.getDate() === scheduledFor.getDate() &&
    logDate.getHours() === scheduledFor.getHours() &&
    logDate.getMinutes() === scheduledFor.getMinutes()
  );
}

function isMedicationInDateRange(
  medication: Medication,
  today = new Date(),
): boolean {
  const startDate = new Date(medication.startDate);
  const endDate = medication.endDate
    ? new Date(medication.endDate)
    : null;
  const startOfToday = new Date(today);
  const endOfToday = new Date(today);

  startOfToday.setHours(0, 0, 0, 0);
  endOfToday.setHours(23, 59, 59, 999);

  if (
    Number.isNaN(startDate.getTime()) ||
    startDate > endOfToday
  ) {
    return false;
  }

  return (
    !endDate ||
    (!Number.isNaN(endDate.getTime()) && endDate >= startOfToday)
  );
}

function withTodaysMedicationLogs(medications: Medication[]): {
  medications: Medication[];
  changed: boolean;
} {
  let changed = false;

  const medicationsWithLogs = medications.map((medication) => {
    if (
      medication.status !== "ACTIVE" ||
      !isMedicationInDateRange(medication)
    ) {
      return medication;
    }

    let logs = medication.logs;

    medication.schedules.forEach((schedule) => {
      const scheduledFor = scheduledForToday(
        schedule.scheduledTime,
      );

      if (
        !scheduledFor ||
        logs.some((log) => isSameScheduledDose(log, scheduledFor))
      ) {
        return;
      }

      changed = true;
      logs = [
        ...logs,
        {
          id: createId("log"),
          scheduledFor: scheduledFor.toISOString(),
          takenAt: null,
          status: "PENDING",
        },
      ];
    });

    return logs === medication.logs
      ? medication
      : { ...medication, logs };
  });

  return { medications: medicationsWithLogs, changed };
}

function persistStore(
  userId: string,
  store: UserMedicationStore,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const persistedState: PersistedMedicationState = {
    version: STORAGE_VERSION,
    medications: store.medications,
  };

  try {
    window.localStorage.setItem(
      storageKeyForUser(userId),
      JSON.stringify(persistedState),
    );
  } catch {
    // The in-memory store remains usable if browser storage is unavailable.
  }
}

function getUserStore(userId: string): UserMedicationStore {
  const existingStore = userStores.get(userId);

  if (existingStore) {
    return existingStore;
  }

  const loadedMedications =
    readStoredMedications(userId) ?? cloneSeedMedications();
  const rolledState = withTodaysMedicationLogs(loadedMedications);
  const store: UserMedicationStore = {
    medications: rolledState.medications,
    listeners: new Set(),
  };

  userStores.set(userId, store);

  if (rolledState.changed) {
    persistStore(userId, store);
  }

  return store;
}

function publish(
  userId: string,
  nextMedications: Medication[],
): void {
  const store = getUserStore(userId);

  store.medications = nextMedications;
  persistStore(userId, store);
  store.listeners.forEach((listener) => listener());
}

export function subscribeToMedicationStore(
  userId: string,
  listener: MedicationStoreListener,
): () => void {
  const store = getUserStore(userId);

  store.listeners.add(listener);

  return () => store.listeners.delete(listener);
}

export function getMedicationSnapshot(
  userId: string,
): Medication[] {
  return getUserStore(userId).medications;
}

export function ensureMedicationLogsForToday(userId: string): void {
  const store = getUserStore(userId);
  const rolledState = withTodaysMedicationLogs(store.medications);

  if (rolledState.changed) {
    publish(userId, rolledState.medications);
  }
}

export function addMedication(
  userId: string,
  input: NewMedicationInput,
): void {
  const medicationId = createId("medication");
  const medication: Medication = {
    id: medicationId,
    name: input.name.trim(),
    dosage: input.dosage.trim(),
    instructions: input.instructions?.trim() || null,
    startDate: toIsoDate(input.startDate),
    endDate: input.endDate ? toIsoDate(input.endDate) : null,
    status: "ACTIVE",
    schedules: [
      {
        id: createId("schedule"),
        scheduledTime: input.scheduledTime,
        frequency: input.frequency.trim(),
      },
    ],
    logs: [],
  };

  const rolledState = withTodaysMedicationLogs([
    ...getUserStore(userId).medications,
    medication,
  ]);

  publish(userId, rolledState.medications);
}

export function updateMedicationStatus(
  userId: string,
  medicationId: string,
  status: MedicationStatus,
): void {
  const medications = getUserStore(userId).medications;

  const nextMedications = medications.map(
    (medication) =>
      medication.id === medicationId
        ? { ...medication, status }
        : medication,
  );

  publish(
    userId,
    withTodaysMedicationLogs(nextMedications).medications,
  );
}

export function updateMedicationLogStatus(
  userId: string,
  medicationId: string,
  medicationLogId: string,
  status: MedicationLogStatus,
): void {
  const medications = getUserStore(userId).medications;

  publish(
    userId,
    medications.map((medication) =>
      medication.id === medicationId
        ? {
            ...medication,
            logs: medication.logs.map((log) =>
              log.id === medicationLogId
                ? {
                    ...log,
                    status,
                    takenAt:
                      status === "TAKEN"
                        ? new Date().toISOString()
                        : null,
                  }
                : log,
            ),
          }
        : medication,
    ),
  );
}

export function deleteMedication(
  userId: string,
  medicationId: string,
): void {
  const medications = getUserStore(userId).medications;

  publish(
    userId,
    medications.filter(
      (medication) => medication.id !== medicationId,
    ),
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    userStores.forEach((store, userId) => {
      if (event.key !== storageKeyForUser(userId)) {
        return;
      }

      const storedMedications = event.newValue
        ? parseStoredMedications(event.newValue)
        : cloneSeedMedications();

      if (!storedMedications) {
        return;
      }

      const rolledState = withTodaysMedicationLogs(
        storedMedications,
      );
      store.medications = rolledState.medications;

      if (rolledState.changed) {
        persistStore(userId, store);
      }

      store.listeners.forEach((listener) => listener());
    });
  });
}
