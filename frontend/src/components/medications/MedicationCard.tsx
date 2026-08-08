import {
  getPrimarySchedule,
  getTodaysMedicationLog,
  type Medication,
} from "../../types/medication";

interface MedicationCardProps {
  medication: Medication;
  onMarkTaken: (
    medicationId: string,
    medicationLogId: string,
  ) => void;
}

export default function MedicationCard({
  medication,
  onMarkTaken,
}: MedicationCardProps) {
  const schedule = getPrimarySchedule(medication);
  const todaysLog = getTodaysMedicationLog(medication);

  return (
    <article className="medication-card">
      <div className="medication-card-header">
        <div>
          <h3>{medication.name}</h3>
          <p className="medication-dosage">
            {medication.dosage}
          </p>
        </div>

        <div>
          <span
            className={`status-badge medication-status-${medication.status.toLowerCase()}`}
          >
            {medication.status}
          </span>{" "}
          {todaysLog && (
            <span
              className={`status-badge status-${todaysLog.status.toLowerCase()}`}
            >
              {todaysLog.status}
            </span>
          )}
        </div>
      </div>

      <div className="medication-information">
        <p>
          <strong>Time:</strong>{" "}
          {schedule?.scheduledTime ?? "Not scheduled"}
        </p>

        <p>
          <strong>Frequency:</strong>{" "}
          {schedule?.frequency ?? "Not specified"}
        </p>

        <p>
          <strong>Instructions:</strong>{" "}
          {medication.instructions ?? "No instructions provided"}
        </p>
      </div>

      {medication.status === "ACTIVE" &&
        todaysLog?.status === "PENDING" && (
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              onMarkTaken(medication.id, todaysLog.id)
            }
          >
            Mark as taken
          </button>
        )}
    </article>
  );
}
