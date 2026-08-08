import { useNavigate } from "react-router-dom";
import MedicationCard from "../../components/medications/MedicationCard";
import { useMedications } from "../../services/use-medications";
import { getTodaysMedicationLog } from "../../types/medication";

export default function PatientDashboardPage() {
  const navigate = useNavigate();
  const { medications, updateMedicationLogStatus } =
    useMedications();
  const activeMedications = medications.filter(
    (medication) => medication.status === "ACTIVE",
  );
  const todaysMedications = activeMedications.filter(
    (medication) => getTodaysMedicationLog(medication) !== null,
  );

  const takenCount = todaysMedications.filter(
    (medication) =>
      getTodaysMedicationLog(medication)?.status === "TAKEN",
  ).length;

  const pendingCount = todaysMedications.filter(
    (medication) =>
      getTodaysMedicationLog(medication)?.status === "PENDING",
  ).length;

  function markMedicationAsTaken(
    medicationId: string,
    medicationLogId: string,
  ) {
    updateMedicationLogStatus(
      medicationId,
      medicationLogId,
      "TAKEN",
    );
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-label">Medical Tracking System</p>
          <h1>Welcome to your dashboard</h1>
          <p>
            Review today&apos;s medications, appointments, and health
            information.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate("/medications")}
        >
          Manage medications
        </button>
      </header>

      <section className="summary-grid">
        <article className="summary-card">
          <p>Active medications</p>
          <strong>{activeMedications.length}</strong>
        </article>

        <article className="summary-card">
          <p>Taken today</p>
          <strong>{takenCount}</strong>
        </article>

        <article className="summary-card">
          <p>Pending</p>
          <strong>{pendingCount}</strong>
        </article>

        <article className="summary-card">
          <p>Next appointment</p>
          <strong>Not scheduled</strong>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>Today&apos;s medications</h2>
            <p>Mark medications as taken after using them.</p>
          </div>
        </div>

        {todaysMedications.length === 0 ? (
          <p>No medications scheduled for today.</p>
        ) : (
          <div className="medication-grid">
            {todaysMedications.map((medication) => (
              <MedicationCard
                key={medication.id}
                medication={medication}
                onMarkTaken={markMedicationAsTaken}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
