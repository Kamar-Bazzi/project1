import { useState } from "react";

interface Medication {
  id: string;
  name: string;
  dosage: string;
  instructions: string;
  scheduledTime: string;
  frequency: string;
  startDate: string;
  endDate?: string;
  status: "Active" | "Completed" | "Cancelled";
  doseStatus: "Pending" | "Taken" | "Missed" | "Skipped";
}

const initialMedications: Medication[] = [
  {
    id: "1",
    name: "Amoxicillin",
    dosage: "500 mg",
    instructions: "Take after breakfast",
    scheduledTime: "08:00 AM",
    frequency: "Twice daily",
    startDate: "2026-08-01",
    endDate: "2026-08-10",
    status: "Active",
    doseStatus: "Pending",
  },
  {
    id: "2",
    name: "Paracetamol",
    dosage: "650 mg",
    instructions: "Take with water if needed",
    scheduledTime: "02:00 PM",
    frequency: "As needed",
    startDate: "2026-08-02",
    status: "Active",
    doseStatus: "Taken",
  },
  {
    id: "3",
    name: "Vitamin D3",
    dosage: "1000 IU",
    instructions: "Take with meal",
    scheduledTime: "10:00 AM",
    frequency: "Once daily",
    startDate: "2026-07-15",
    endDate: "2026-08-15",
    status: "Active",
    doseStatus: "Pending",
  },
];

export default function MedicationsPage() {
  const [medications, setMedications] = useState<Medication[]>(initialMedications);
  const [isLoading] = useState<boolean>(false);
  const [error] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [doseStatusFilter, setDoseStatusFilter] = useState("All");

  // Summary calculations
  const totalMedications = medications.length;
  const activeMedications = medications.filter((m) => m.status === "Active").length;
  const takenToday = medications.filter((m) => m.doseStatus === "Taken").length;
  const missedToday = medications.filter((m) => m.doseStatus === "Missed").length;

  const handleUpdateDoseStatus = (id: string, newDoseStatus: "Taken" | "Missed" | "Skipped") => {
    setMedications((prev) =>
      prev.map((med) => (med.id === id ? { ...med, doseStatus: newDoseStatus } : med))
    );
  };

  const filteredMedications = medications.filter((med) => {
    const matchesSearch = med.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || med.status === statusFilter;
    const matchesDoseStatus = doseStatusFilter === "All" || med.doseStatus === doseStatusFilter;
    return matchesSearch && matchesStatus && matchesDoseStatus;
  });

  if (isLoading) {
    return <div style={styles.centerMessage}>Loading medications...</div>;
  }

  if (error) {
    return <div style={{ ...styles.centerMessage, color: "#ef4444" }}>{error}</div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>My Medications</h1>
          <p style={styles.subtitle}>View your medication schedule and track each dose.</p>
        </div>
        <button style={styles.addButton} onClick={() => alert("Add Medication modal/feature")}>
          + Add Medication
        </button>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Total medications</span>
          <span style={styles.summaryValue}>{totalMedications}</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Active medications</span>
          <span style={styles.summaryValue}>{activeMedications}</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Taken today</span>
          <span style={styles.summaryValue}>{takenToday}</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Missed today</span>
          <span style={styles.summaryValue}>{missedToday}</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div style={styles.filterContainer}>
        <input
          type="text"
          placeholder="Search by medication name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.selectInput}
        >
          <option value="All">Status: All</option>
          <option value="Active">Active</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <select
          value={doseStatusFilter}
          onChange={(e) => setDoseStatusFilter(e.target.value)}
          style={styles.selectInput}
        >
          <option value="All">Dose: All</option>
          <option value="Pending">Pending</option>
          <option value="Taken">Taken</option>
          <option value="Missed">Missed</option>
          <option value="Skipped">Skipped</option>
        </select>
      </div>

      {/* Medication List */}
      {medications.length === 0 ? (
        <div style={styles.centerMessage}>No medications found.</div>
      ) : filteredMedications.length === 0 ? (
        <div style={styles.centerMessage}>No matching medications.</div>
      ) : (
        <div style={styles.medGrid}>
          {filteredMedications.map((med) => (
            <div key={med.id} style={styles.medCard}>
              <div style={styles.cardHeader}>
                <h3 style={styles.medName}>{med.name}</h3>
                <div style={styles.badgeGroup}>
                  <span style={getStatusBadgeStyle(med.status)}>{med.status}</span>
                  <span style={getDoseBadgeStyle(med.doseStatus)}>{med.doseStatus}</span>
                </div>
              </div>

              <div style={styles.cardBody}>
                <p><strong>Dosage:</strong> {med.dosage}</p>
                <p><strong>Instructions:</strong> {med.instructions}</p>
                <p><strong>Scheduled Time:</strong> {med.scheduledTime}</p>
                <p><strong>Frequency:</strong> {med.frequency}</p>
                <p><strong>Start Date:</strong> {med.startDate}</p>
                {med.endDate && <p><strong>End Date:</strong> {med.endDate}</p>}
              </div>

              <div style={styles.cardActions}>
                <button style={styles.actionBtn} onClick={() => alert(`View details for ${med.name}`)}>View</button>
                <button style={styles.actionBtn} onClick={() => alert(`Edit ${med.name}`)}>Edit</button>
                <button style={{ ...styles.actionBtn, color: "#ef4444" }} onClick={() => alert(`Delete ${med.name}`)}>Delete</button>

                {med.doseStatus === "Pending" && (
                  <>
                    <button style={{ ...styles.actionBtn, backgroundColor: "#22c55e", color: "#fff" }} onClick={() => handleUpdateDoseStatus(med.id, "Taken")}>
                      Take
                    </button>
                    <button style={{ ...styles.actionBtn, backgroundColor: "#ef4444", color: "#fff" }} onClick={() => handleUpdateDoseStatus(med.id, "Missed")}>
                      Miss
                    </button>
                    <button style={{ ...styles.actionBtn, backgroundColor: "#eab308", color: "#fff" }} onClick={() => handleUpdateDoseStatus(med.id, "Skipped")}>
                      Skip
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helpers for Status Styles
function getStatusBadgeStyle(status: string) {
  let bg = "#cbd5e1";
  let color = "#0f172a";
  if (status === "Active") { bg = "#dbeafe"; color = "#1e40af"; }
  else if (status === "Completed") { bg = "#dcfce7"; color = "#166534"; }
  else if (status === "Cancelled") { bg = "#fee2e2"; color = "#991b1b"; }
  return { padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "600", backgroundColor: bg, color };
}

function getDoseBadgeStyle(doseStatus: string) {
  let bg = "#cbd5e1";
  let color = "#0f172a";
  if (doseStatus === "Pending") { bg = "#fef9c3"; color = "#854d0e"; }
  else if (doseStatus === "Taken") { bg = "#dcfce7"; color = "#166534"; }
  else if (doseStatus === "Missed") { bg = "#fee2e2"; color = "#991b1b"; }
  else if (doseStatus === "Skipped") { bg = "#f3f4f6"; color = "#374151"; }
  return { padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "600", backgroundColor: bg, color };
}

const styles = {
  container: { padding: "30px", backgroundColor: "#0f172a", minHeight: "100vh", color: "#f8fafc", boxSizing: "border-box" as const },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap" as const, gap: "15px" },
  title: { fontSize: "28px", fontWeight: "bold", margin: 0 },
  subtitle: { fontSize: "14px", color: "#94a3b8", margin: "4px 0 0 0" },
  addButton: { padding: "10px 16px", backgroundColor: "#38bdf8", color: "#0f172a", fontWeight: "bold", border: "none", borderRadius: "6px", cursor: "pointer" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" },
  summaryCard: { backgroundColor: "#1e293b", padding: "20px", borderRadius: "8px", display: "flex", flexDirection: "column" as const, border: "1px solid #334155" },
  summaryLabel: { fontSize: "13px", color: "#94a3b8", marginBottom: "8px" },
  summaryValue: { fontSize: "24px", fontWeight: "bold", color: "#38bdf8" },
  filterContainer: { display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" as const },
  searchInput: { flex: 1, minWidth: "200px", padding: "10px 12px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", outline: "none" },
  selectInput: { padding: "10px 12px", borderRadius: "6px", border: "1px solid #334155", backgroundColor: "#1e293b", color: "#fff", outline: "none" },
  medGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" },
  medCard: { backgroundColor: "#1e293b", borderRadius: "10px", padding: "20px", border: "1px solid #334155", display: "flex", flexDirection: "column" as const, justifyContent: "space-between" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" },
  medName: { fontSize: "18px", fontWeight: "bold", margin: 0, color: "#f8fafc" },
  badgeGroup: { display: "flex", gap: "6px", flexDirection: "column" as const, alignItems: "flex-end" },
  cardBody: { fontSize: "14px", color: "#cbd5e1", lineHeight: "1.6", marginBottom: "16px" },
  cardActions: { display: "flex", gap: "8px", flexWrap: "wrap" as const, borderTop: "1px solid #334155", paddingTop: "12px" },
  actionBtn: { padding: "6px 10px", borderRadius: "4px", border: "1px solid #475569", backgroundColor: "#334155", color: "#f8fafc", fontSize: "12px", cursor: "pointer", fontWeight: "600" },
  centerMessage: { textAlign: "center" as const, padding: "40px", color: "#94a3b8", fontSize: "16px" },
}