import {
  formatEnumLabel,
  formatMedicationDoseTime,
  getTodaysMedicationLogs,
  type Medication,
  type MedicationLogStatus,
} from "../../types/medication";

interface MedicationCardProps {
  medication: Medication;
  mutationKey: string | null;
  onUpdateLogStatus: (
    medicationId: string,
    medicationLogId: string,
    status: MedicationLogStatus,
  ) => Promise<boolean>;
}

export default function MedicationCard({
  medication,
  mutationKey,
  onUpdateLogStatus,
}: MedicationCardProps) {
  const logs = getTodaysMedicationLogs(medication);

  return (
    <article className="card dashboard-medication-card">
      <div className="medication-card-header">
        <div>
          <h3>{medication.name}</h3>
          <p className="medication-dose">{medication.dosage}</p>
        </div>
        <span className={`badge badge-${medication.status.toLowerCase()}`}>
          {formatEnumLabel(medication.status)}
        </span>
      </div>

      <p className="medication-instructions">
        {medication.instructions || "No special instructions"}
      </p>

      <div className="dashboard-dose-list">
        {logs.map((log) => (
          <div className="dashboard-dose" key={log.id}>
            <div>
              <strong>
                {formatMedicationDoseTime(
                  log.scheduledFor,
                  medication.timeZone,
                )}
              </strong>
              <span className={`badge badge-${log.status.toLowerCase()}`}>
                {formatEnumLabel(log.status)}
              </span>
            </div>
            <div className="dashboard-dose-actions">
              {(["TAKEN", "MISSED", "SKIPPED"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`button button-small ${
                    status === "TAKEN" ? "button-primary" : "button-ghost"
                  }`}
                  disabled={mutationKey !== null || log.status === status}
                  onClick={() =>
                    void onUpdateLogStatus(medication.id, log.id, status)
                  }
                >
                  {mutationKey === `log:${log.id}`
                    ? "Saving…"
                    : formatEnumLabel(status)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
