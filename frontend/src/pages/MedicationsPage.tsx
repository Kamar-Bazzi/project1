import { type FormEvent, useState } from "react";
import { useMedications } from "../services/use-medications";
import {
  getPrimarySchedule,
  getTodaysMedicationLog,
  type Medication,
  type MedicationLogStatus,
  type MedicationStatus,
} from "../types/medication";

type MedicationStatusFilter = "ALL" | MedicationStatus;
type MedicationLogStatusFilter = "ALL" | MedicationLogStatus;

interface MedicationDraft {
  name: string;
  dosage: string;
  instructions: string;
  scheduledTime: string;
  frequency: string;
  startDate: string;
  endDate: string;
}

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

function todayForDateInput(): string {
  const today = new Date();
  const localToday = new Date(
    today.getTime() - today.getTimezoneOffset() * 60_000,
  );

  return localToday.toISOString().slice(0, 10);
}

function createEmptyDraft(): MedicationDraft {
  return {
    name: "",
    dosage: "",
    instructions: "",
    scheduledTime: "08:00",
    frequency: "Once daily",
    startDate: todayForDateInput(),
    endDate: "",
  };
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Ongoing";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString();
}

function formatStatus(value: string): string {
  return `${value.charAt(0)}${value.slice(1).toLowerCase()}`;
}

export default function MedicationsPage() {
  const {
    medications,
    addMedication,
    deleteMedication,
    updateMedicationLogStatus,
    updateMedicationStatus,
  } = useMedications();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<MedicationStatusFilter>("ALL");
  const [doseStatusFilter, setDoseStatusFilter] =
    useState<MedicationLogStatusFilter>("ALL");
  const [isAddingMedication, setIsAddingMedication] =
    useState(false);
  const [draft, setDraft] =
    useState<MedicationDraft>(createEmptyDraft);
  const [formError, setFormError] = useState<string | null>(
    null,
  );

  const totalMedications = medications.length;
  const activeMedications = medications.filter(
    (medication) => medication.status === "ACTIVE",
  ).length;
  const takenToday = medications.filter(
    (medication) =>
      getTodaysMedicationLog(medication)?.status === "TAKEN",
  ).length;
  const missedToday = medications.filter(
    (medication) =>
      getTodaysMedicationLog(medication)?.status === "MISSED",
  ).length;

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredMedications = medications.filter((medication) => {
    const todaysLog = getTodaysMedicationLog(medication);
    const matchesSearch = medication.name
      .toLowerCase()
      .includes(normalizedSearchTerm);
    const matchesStatus =
      statusFilter === "ALL" || medication.status === statusFilter;
    const matchesDoseStatus =
      doseStatusFilter === "ALL" ||
      todaysLog?.status === doseStatusFilter;

    return matchesSearch && matchesStatus && matchesDoseStatus;
  });

  function handleAddMedication(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();

    if (
      !draft.name.trim() ||
      !draft.dosage.trim() ||
      !draft.scheduledTime ||
      !draft.frequency.trim() ||
      !draft.startDate
    ) {
      setFormError("Complete all required medication fields.");
      return;
    }

    if (draft.endDate && draft.endDate < draft.startDate) {
      setFormError("End date cannot be before the start date.");
      return;
    }

    addMedication({
      name: draft.name,
      dosage: draft.dosage,
      instructions: draft.instructions || null,
      scheduledTime: draft.scheduledTime,
      frequency: draft.frequency,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
    });

    setDraft(createEmptyDraft());
    setFormError(null);
    setIsAddingMedication(false);
  }

  function handleDeleteMedication(medication: Medication): void {
    const shouldDelete = window.confirm(
      `Delete ${medication.name}? This removes its local schedules and dose history.`,
    );

    if (shouldDelete) {
      deleteMedication(medication.id);
    }
  }

  return (
    <main style={styles.container}>
      <header style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>My Medications</h1>
          <p style={styles.subtitle}>
            View your schedule and track each dose.
          </p>
        </div>

        <button
          type="button"
          style={styles.addButton}
          onClick={() => {
            setFormError(null);
            setIsAddingMedication((isOpen) => !isOpen);
          }}
        >
          {isAddingMedication ? "Close form" : "+ Add medication"}
        </button>
      </header>

      {isAddingMedication && (
        <form style={styles.addForm} onSubmit={handleAddMedication}>
          <h2 style={styles.formTitle}>Add medication</h2>

          {formError && (
            <p style={styles.formError} role="alert">
              {formError}
            </p>
          )}

          <div style={styles.formGrid}>
            <label style={styles.field}>
              Name *
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    name: event.target.value,
                  }))
                }
                style={styles.searchInput}
              />
            </label>

            <label style={styles.field}>
              Dosage *
              <input
                value={draft.dosage}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    dosage: event.target.value,
                  }))
                }
                style={styles.searchInput}
                placeholder="e.g. 500 mg"
              />
            </label>

            <label style={styles.field}>
              Scheduled time *
              <input
                type="time"
                value={draft.scheduledTime}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    scheduledTime: event.target.value,
                  }))
                }
                style={styles.searchInput}
              />
            </label>

            <label style={styles.field}>
              Frequency *
              <input
                value={draft.frequency}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    frequency: event.target.value,
                  }))
                }
                style={styles.searchInput}
              />
            </label>

            <label style={styles.field}>
              Start date *
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    startDate: event.target.value,
                  }))
                }
                style={styles.searchInput}
              />
            </label>

            <label style={styles.field}>
              End date
              <input
                type="date"
                value={draft.endDate}
                min={draft.startDate}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    endDate: event.target.value,
                  }))
                }
                style={styles.searchInput}
              />
            </label>

            <label style={{ ...styles.field, ...styles.fullWidthField }}>
              Instructions
              <input
                value={draft.instructions}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    instructions: event.target.value,
                  }))
                }
                style={styles.searchInput}
                placeholder="Optional"
              />
            </label>
          </div>

          <div style={styles.formActions}>
            <button type="submit" style={styles.addButton}>
              Save medication
            </button>
            <button
              type="button"
              style={styles.actionButton}
              onClick={() => {
                setDraft(createEmptyDraft());
                setFormError(null);
                setIsAddingMedication(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <section style={styles.summaryGrid}>
        <article style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Total medications</span>
          <strong style={styles.summaryValue}>{totalMedications}</strong>
        </article>
        <article style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Active medications</span>
          <strong style={styles.summaryValue}>{activeMedications}</strong>
        </article>
        <article style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Taken today</span>
          <strong style={styles.summaryValue}>{takenToday}</strong>
        </article>
        <article style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Missed today</span>
          <strong style={styles.summaryValue}>{missedToday}</strong>
        </article>
      </section>

      <section style={styles.filterContainer}>
        <input
          type="search"
          placeholder="Search by medication name..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          style={styles.searchInput}
          aria-label="Search medications"
        />

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as MedicationStatusFilter,
            )
          }
          style={styles.selectInput}
          aria-label="Filter by lifecycle status"
        >
          <option value="ALL">All lifecycle statuses</option>
          {medicationStatuses.map((status) => (
            <option key={status} value={status}>
              {formatStatus(status)}
            </option>
          ))}
        </select>

        <select
          value={doseStatusFilter}
          onChange={(event) =>
            setDoseStatusFilter(
              event.target.value as MedicationLogStatusFilter,
            )
          }
          style={styles.selectInput}
          aria-label="Filter by dose status"
        >
          <option value="ALL">All dose statuses</option>
          {medicationLogStatuses.map((status) => (
            <option key={status} value={status}>
              {formatStatus(status)}
            </option>
          ))}
        </select>
      </section>

      {medications.length === 0 ? (
        <p style={styles.centerMessage}>No medications found.</p>
      ) : filteredMedications.length === 0 ? (
        <p style={styles.centerMessage}>No matching medications.</p>
      ) : (
        <section style={styles.medicationGrid}>
          {filteredMedications.map((medication) => {
            const schedule = getPrimarySchedule(medication);
            const todaysLog = getTodaysMedicationLog(medication);

            return (
              <article key={medication.id} style={styles.medicationCard}>
                <div>
                  <div style={styles.cardHeader}>
                    <div>
                      <h2 style={styles.medicationName}>
                        {medication.name}
                      </h2>
                      <p style={styles.dosage}>{medication.dosage}</p>
                    </div>

                    <div style={styles.badgeGroup}>
                      <span
                        style={getMedicationStatusBadgeStyle(
                          medication.status,
                        )}
                      >
                        {formatStatus(medication.status)}
                      </span>
                      {todaysLog && (
                        <span
                          style={getDoseStatusBadgeStyle(
                            todaysLog.status,
                          )}
                        >
                          {formatStatus(todaysLog.status)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={styles.cardBody}>
                    <p>
                      <strong>Instructions:</strong>{" "}
                      {medication.instructions ??
                        "No instructions provided"}
                    </p>
                    <p>
                      <strong>Time:</strong>{" "}
                      {schedule?.scheduledTime ?? "Not scheduled"}
                    </p>
                    <p>
                      <strong>Frequency:</strong>{" "}
                      {schedule?.frequency ?? "Not specified"}
                    </p>
                    <p>
                      <strong>Start date:</strong>{" "}
                      {formatDate(medication.startDate)}
                    </p>
                    <p>
                      <strong>End date:</strong>{" "}
                      {formatDate(medication.endDate)}
                    </p>
                  </div>
                </div>

                <div style={styles.cardActions}>
                  <label style={styles.statusField}>
                    Lifecycle
                    <select
                      value={medication.status}
                      onChange={(event) =>
                        updateMedicationStatus(
                          medication.id,
                          event.target.value as MedicationStatus,
                        )
                      }
                      style={styles.compactSelect}
                    >
                      {medicationStatuses.map((status) => (
                        <option key={status} value={status}>
                          {formatStatus(status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {todaysLog && medication.status === "ACTIVE" && (
                    <div style={styles.doseActions}>
                      {medicationLogStatuses.map((status) => (
                        <button
                          key={status}
                          type="button"
                          style={{
                            ...styles.actionButton,
                            ...(todaysLog.status === status
                              ? styles.selectedActionButton
                              : {}),
                          }}
                          disabled={todaysLog.status === status}
                          onClick={() =>
                            updateMedicationLogStatus(
                              medication.id,
                              todaysLog.id,
                              status,
                            )
                          }
                        >
                          {formatStatus(status)}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    style={styles.deleteButton}
                    onClick={() =>
                      handleDeleteMedication(medication)
                    }
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

function getMedicationStatusBadgeStyle(status: MedicationStatus) {
  const colors: Record<MedicationStatus, { background: string; color: string }> = {
    ACTIVE: { background: "#dbeafe", color: "#1e40af" },
    COMPLETED: { background: "#dcfce7", color: "#166534" },
    CANCELLED: { background: "#fee2e2", color: "#991b1b" },
  };

  return { ...styles.badge, ...colors[status] };
}

function getDoseStatusBadgeStyle(status: MedicationLogStatus) {
  const colors: Record<MedicationLogStatus, { background: string; color: string }> = {
    PENDING: { background: "#fef9c3", color: "#854d0e" },
    TAKEN: { background: "#dcfce7", color: "#166534" },
    MISSED: { background: "#fee2e2", color: "#991b1b" },
    SKIPPED: { background: "#f3f4f6", color: "#374151" },
  };

  return { ...styles.badge, ...colors[status] };
}

const styles = {
  container: {
    padding: "30px",
    backgroundColor: "#0f172a",
    minHeight: "100vh",
    color: "#f8fafc",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
    flexWrap: "wrap" as const,
    gap: "15px",
  },
  title: { fontSize: "28px", fontWeight: "bold", margin: 0 },
  subtitle: { fontSize: "14px", color: "#94a3b8", margin: "4px 0 0" },
  addButton: {
    padding: "10px 16px",
    backgroundColor: "#38bdf8",
    color: "#0f172a",
    fontWeight: "bold",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  addForm: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "20px",
    marginBottom: "24px",
  },
  formTitle: { margin: "0 0 16px" },
  formError: { color: "#fecaca", margin: "0 0 16px" },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
    color: "#cbd5e1",
    fontSize: "13px",
    fontWeight: "600",
  },
  fullWidthField: { gridColumn: "1 / -1" },
  formActions: { display: "flex", gap: "10px", marginTop: "18px" },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  summaryCard: {
    backgroundColor: "#1e293b",
    padding: "20px",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column" as const,
    border: "1px solid #334155",
  },
  summaryLabel: { fontSize: "13px", color: "#94a3b8", marginBottom: "8px" },
  summaryValue: { fontSize: "24px", color: "#38bdf8" },
  filterContainer: {
    display: "flex",
    gap: "12px",
    marginBottom: "24px",
    flexWrap: "wrap" as const,
  },
  searchInput: {
    flex: 1,
    minWidth: "180px",
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #475569",
    backgroundColor: "#0f172a",
    color: "#fff",
    outline: "none",
  },
  selectInput: {
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #475569",
    backgroundColor: "#1e293b",
    color: "#fff",
  },
  medicationGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "20px",
  },
  medicationCard: {
    backgroundColor: "#1e293b",
    borderRadius: "10px",
    padding: "20px",
    border: "1px solid #334155",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "12px",
  },
  medicationName: { fontSize: "18px", margin: 0 },
  dosage: { margin: "5px 0 0", color: "#94a3b8" },
  badgeGroup: {
    display: "flex",
    gap: "6px",
    flexDirection: "column" as const,
    alignItems: "flex-end",
  },
  badge: {
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "600",
  },
  cardBody: { fontSize: "14px", color: "#cbd5e1", lineHeight: "1.6" },
  cardActions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "10px",
    borderTop: "1px solid #334155",
    paddingTop: "12px",
  },
  statusField: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    color: "#cbd5e1",
    fontSize: "13px",
  },
  compactSelect: {
    padding: "6px 8px",
    borderRadius: "4px",
    border: "1px solid #475569",
    backgroundColor: "#0f172a",
    color: "#fff",
  },
  doseActions: { display: "flex", gap: "6px", flexWrap: "wrap" as const },
  actionButton: {
    padding: "7px 10px",
    borderRadius: "4px",
    border: "1px solid #475569",
    backgroundColor: "#334155",
    color: "#f8fafc",
    cursor: "pointer",
  },
  selectedActionButton: { backgroundColor: "#0ea5e9", color: "#082f49" },
  deleteButton: {
    padding: "7px 10px",
    borderRadius: "4px",
    border: "1px solid #ef4444",
    backgroundColor: "transparent",
    color: "#fca5a5",
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  centerMessage: {
    textAlign: "center" as const,
    padding: "40px",
    color: "#94a3b8",
  },
};
