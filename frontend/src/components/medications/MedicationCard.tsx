import type { Medication } from "../../types/medication";

interface MedicationCardProps {
  medication: Medication;
  onMarkTaken: (medicationId: string) => void;
}

export default function MedicationCard({
  medication,
  onMarkTaken,
}: MedicationCardProps) {
  return (
    <article className="medication-card">
      <div className="medication-card-header">
        <div>
          <h3>{medication.name}</h3>
          <p className="medication-dosage">{medication.dosage}</p>
        </div>

        <span
          className={`status-badge status-${medication.status.toLowerCase()}`}
        >
          {medication.status}
        </span>
      </div>

      <div className="medication-information">
        <p>
          <strong>Time:</strong> {medication.scheduledTime}
        </p>

        <p>
          <strong>Instructions:</strong> {medication.instructions}
        </p>
      </div>

      {medication.status === "PENDING" && (
        <button
          type="button"
          className="primary-button"
          onClick={() => onMarkTaken(medication.id)}
        >
          Mark as taken
        </button>
      )}
    </article>
  );
}