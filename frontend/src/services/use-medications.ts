import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Medication,
  MedicationInput,
  MedicationLogStatus,
  MedicationRefillInput,
  UpdateMedicationInput,
} from "../types/medication";
import { getApiErrorMessage } from "./api-error";
import {
  medicationService,
  type MedicationListFilters,
} from "./medication.service";

export function useMedications(filters?: MedicationListFilters) {
  const usesPagedList = filters !== undefined;
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const search = filters?.search;
  const status = filters?.status;
  const doseStatus = filters?.doseStatus;
  const [medications, setMedications] = useState<Medication[]>([]);
  const [pagination, setPagination] = useState({
    page,
    pageSize,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(
    async (silent = false): Promise<boolean> => {
      const currentRequestId = ++requestId.current;

      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const result = usesPagedList
          ? await medicationService.listPage({
              page,
              pageSize,
              search,
              status,
              doseStatus,
            })
          : undefined;
        const nextMedications =
          result?.items ?? (await medicationService.list());

        if (requestId.current === currentRequestId) {
          setMedications(nextMedications);
          setPagination({
            ...(result?.pagination ?? {
              page: 1,
              pageSize: nextMedications.length,
              total: nextMedications.length,
              totalPages: nextMedications.length > 0 ? 1 : 0,
            }),
          });
        }
        return true;
      } catch (requestError) {
        if (requestId.current === currentRequestId) {
          setError(
            getApiErrorMessage(
              requestError,
              "We could not load your medications. Please try again.",
            ),
          );
        }
        return false;
      } finally {
        if (requestId.current === currentRequestId) {
          setIsLoading(false);
        }
      }
    },
    [doseStatus, page, pageSize, search, status, usesPagedList],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runMutation = useCallback(
    async <Result>(
      key: string,
      request: () => Promise<Result>,
      commit: (result: Result) => void,
      fallbackMessage: string,
    ): Promise<boolean> => {
      setMutationKey(key);
      setActionError(null);

      try {
        const result = await request();

        // A committed write is authoritative. Invalidate any older GET so it
        // cannot overwrite the mutation response when it completes later.
        requestId.current += 1;
        setError(null);
        setIsLoading(false);
        commit(result);
        if (usesPagedList) {
          void refresh(true);
        }
        return true;
      } catch (requestError) {
        setActionError(getApiErrorMessage(requestError, fallbackMessage));
        return false;
      } finally {
        setMutationKey(null);
      }
    },
    [refresh, usesPagedList],
  );

  const addMedication = useCallback(
    (input: MedicationInput) =>
      runMutation(
        "create",
        () => medicationService.create(input),
        (createdMedication) =>
          setMedications((currentMedications) => [
            createdMedication,
            ...currentMedications.filter(
              (medication) => medication.id !== createdMedication.id,
            ),
          ]),
        "The medication could not be added. Please try again.",
      ),
    [runMutation],
  );

  const updateMedication = useCallback(
    (medicationId: string, input: UpdateMedicationInput) =>
      runMutation(
        `medication:${medicationId}`,
        () => medicationService.update(medicationId, input),
        (updatedMedication) =>
          setMedications((currentMedications) => {
            const medicationExists = currentMedications.some(
              (medication) => medication.id === updatedMedication.id,
            );

            if (!medicationExists) {
              return [updatedMedication, ...currentMedications];
            }

            return currentMedications.map((medication) =>
              medication.id === updatedMedication.id
                ? updatedMedication
                : medication,
            );
          }),
        "The medication could not be updated. Please try again.",
      ),
    [runMutation],
  );

  const deleteMedication = useCallback(
    (medicationId: string) =>
      runMutation(
        `medication:${medicationId}`,
        () => medicationService.remove(medicationId),
        () =>
          setMedications((currentMedications) =>
            currentMedications.filter(
              (medication) => medication.id !== medicationId,
            ),
          ),
        "The medication could not be deleted. Please try again.",
      ),
    [runMutation],
  );

  const updateMedicationLogStatus = useCallback(
    (
      medicationId: string,
      medicationLogId: string,
      status: MedicationLogStatus,
    ) =>
      runMutation(
        `log:${medicationLogId}`,
        () =>
          medicationService.updateLogStatus(
            medicationId,
            medicationLogId,
            status,
          ),
        (updatedLog) =>
          setMedications((currentMedications) =>
            currentMedications.map((medication) =>
              medication.id === medicationId
                ? {
                    ...medication,
                    logs: medication.logs.map((log) =>
                      log.id === updatedLog.id ? updatedLog : log,
                    ),
                  }
                : medication,
            ),
          ),
        "The dose status could not be updated. Please try again.",
      ),
    [runMutation],
  );

  const updateMedicationRefill = useCallback(
    (medicationId: string, input: MedicationRefillInput) =>
      runMutation(
        `refill:${medicationId}`,
        () => medicationService.updateRefill(medicationId, input),
        (updatedMedication) =>
          setMedications((currentMedications) =>
            currentMedications.map((medication) =>
              medication.id === updatedMedication.id
                ? updatedMedication
                : medication,
            ),
          ),
        "The refill details could not be updated. Please try again.",
      ),
    [runMutation],
  );

  return {
    medications,
    pagination,
    isLoading,
    error,
    actionError,
    mutationKey,
    refresh,
    clearActionError: () => setActionError(null),
    addMedication,
    updateMedication,
    deleteMedication,
    updateMedicationLogStatus,
    updateMedicationRefill,
  };
}
