import {
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";
import { useAuth } from "../components/auth/auth-context";
import type {
  MedicationLogStatus,
  MedicationStatus,
  NewMedicationInput,
} from "../types/medication";
import {
  addMedication as addMedicationToStore,
  deleteMedication as deleteMedicationFromStore,
  ensureMedicationLogsForToday,
  getMedicationSnapshot,
  subscribeToMedicationStore,
  updateMedicationLogStatus as updateLogStatusInStore,
  updateMedicationStatus as updateStatusInStore,
} from "./medication-store";

export function useMedications() {
  const { user } = useAuth();
  const userId = user.id;
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeToMedicationStore(userId, listener),
    [userId],
  );
  const getSnapshot = useCallback(
    () => getMedicationSnapshot(userId),
    [userId],
  );
  const medications = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    ensureMedicationLogsForToday(userId);

    const rolloverInterval = window.setInterval(() => {
      ensureMedicationLogsForToday(userId);
    }, 60_000);

    return () => window.clearInterval(rolloverInterval);
  }, [userId]);

  const addMedication = useCallback(
    (input: NewMedicationInput) =>
      addMedicationToStore(userId, input),
    [userId],
  );
  const deleteMedication = useCallback(
    (medicationId: string) =>
      deleteMedicationFromStore(userId, medicationId),
    [userId],
  );
  const updateMedicationStatus = useCallback(
    (medicationId: string, status: MedicationStatus) =>
      updateStatusInStore(userId, medicationId, status),
    [userId],
  );
  const updateMedicationLogStatus = useCallback(
    (
      medicationId: string,
      medicationLogId: string,
      status: MedicationLogStatus,
    ) =>
      updateLogStatusInStore(
        userId,
        medicationId,
        medicationLogId,
        status,
      ),
    [userId],
  );

  return {
    medications,
    addMedication,
    deleteMedication,
    updateMedicationLogStatus,
    updateMedicationStatus,
  };
}
