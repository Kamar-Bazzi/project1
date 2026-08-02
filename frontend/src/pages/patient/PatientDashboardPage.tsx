import { useState } from "react";
import MedicationCard from "../../components/medications/MedicationCard";
import { mockMedications } from "../../mocks/medications";
import type { Medication } from "../../types/medication";

export default function PatientDashboardPage() {
  const [medications, setMedications] =
    useState<Medication[]>(mockMedications);

  const takenCount = medications.filter(
    (medication) => medication.status === "TAKEN",
  ).length;

  const pendingCount = medications.filter(
    (medication) => medication.status === "PENDING",
  ).length;

  function markMedicationAsTaken(medicationId: string) {
    setMedications((currentMedications) =>
      currentMedications.map((medication) =>
        medication.id === medicationId
          ? {
              ...medication,
              status: "TAKEN",
            }
          : medication,
      ),
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

        <button type="button" className="secondary-button">
          Add medication
        </button>
      </header>

      <section className="summary-grid">
        <article className="summary-card">
          <p>Total medications</p>
          <strong>{medications.length}</strong>
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
          <strong>August 10</strong>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>Today&apos;s medications</h2>
            <p>Mark medications as taken after using them.</p>
          </div>
        </div>

        <div className="medication-grid">
          {medications.map((medication) => (
            <MedicationCard
              key={medication.id}
              medication={medication}
              onMarkTaken={markMedicationAsTaken}
            />
          ))}
        </div>
      </section>
    </main>
  );
}