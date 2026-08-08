import { useState } from "react";

export default function DoctorDashboard() {
 
  const [doctorInfo] = useState({
    name: "Dr. Sarah Johnson",
    specialization: "Cardiology & Internal Medicine",
    assignedPatientsCount: 14,
  });

  const [upcomingAppointments] = useState([
    { id: "1", patientName: "John Doe", time: "10:00 AM", date: "Today", type: "Follow-up" },
    { id: "2", patientName: "Emma Smith", time: "11:30 AM", date: "Today", type: "Initial Consultation" },
  ]);

  const [missedMedicationsPatients] = useState([
    { id: "101", patientName: "Michael Brown", medication: "Amoxicillin", missedTime: "08:00 AM" },
    { id: "102", patientName: "Lisa White", medication: "Metformin", missedTime: "09:00 AM" },
  ]);

  const [recentActivity] = useState([
    { id: "201", text: "John Doe updated blood pressure measurements.", time: "15 mins ago" },
    { id: "202", text: "Emma Smith completed her daily medication dose.", time: "1 hour ago" },
  ]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{doctorInfo.name}</h1>
          <p style={styles.subtitle}>{doctorInfo.specialization}</p>
        </div>
        <div style={styles.badge}>
          <span>Assigned Patients: </span>
          <strong style={{ color: "#38bdf8" }}>{doctorInfo.assignedPatientsCount}</strong>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div style={styles.quickActionsRow}>
        <button style={styles.quickBtn} onClick={() => alert("Navigate to Assigned Patients")}>
          👥 Assigned Patients
        </button>
        <button style={styles.quickBtn} onClick={() => alert("Navigate to Appointments")}>
          📅 Appointments
        </button>
        <button style={styles.quickBtn} onClick={() => alert("Navigate to Patient Details")}>
          🔍 Patient Details
        </button>
      </div>

      {/* Dashboard Main Content Grid */}
      <div style={styles.grid}>
        {/* Upcoming Appointments */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Upcoming Appointments</h3>
          {upcomingAppointments.length === 0 ? (
            <p style={styles.emptyText}>No upcoming appointments today.</p>
          ) : (
            upcomingAppointments.map((app) => (
              <div key={app.id} style={styles.listItem}>
                <div>
                  <strong>{app.patientName}</strong>
                  <span style={styles.subText}> ({app.type})</span>
                </div>
                <span style={styles.tag}>{app.time}</span>
              </div>
            ))
          )}
        </div>

        {/* Missed Medications */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Patients with Missed Medications</h3>
          {missedMedicationsPatients.length === 0 ? (
            <p style={styles.emptyText}>No missed medications reported.</p>
          ) : (
            missedMedicationsPatients.map((item) => (
              <div key={item.id} style={styles.listItemAlert}>
                <div>
                  <strong>{item.patientName}</strong>
                  <p style={styles.subTextAlert}>Missed {item.medication} at {item.missedTime}</p>
                </div>
                <span style={styles.alertBadge}>Missed</span>
              </div>
            ))
          )}
        </div>

        {/* Recent Patient Activity */}
        <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
          <h3 style={styles.cardTitle}>Recent Patient Activity</h3>
          {recentActivity.map((act) => (
            <div key={act.id} style={styles.activityItem}>
              <span>{act.text}</span>
              <span style={styles.subText}>{act.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: "30px", backgroundColor: "#090d16", minHeight: "100vh", color: "#f8fafc", boxSizing: "border-box" as const },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap" as const, gap: "15px", borderBottom: "1px solid #1e293b", paddingBottom: "20px" },
  title: { fontSize: "26px", fontWeight: "bold", margin: 0, color: "#38bdf8" },
  subtitle: { fontSize: "14px", color: "#94a3b8", margin: "4px 0 0 0" },
  badge: { backgroundColor: "#1e293b", padding: "10px 16px", borderRadius: "8px", border: "1px solid #334155", fontSize: "14px" },
  quickActionsRow: { display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" as const },
  quickBtn: { padding: "10px 16px", backgroundColor: "#1e293b", color: "#38bdf8", border: "1px solid #334155", borderRadius: "8px", fontWeight: "600", cursor: "pointer", transition: "0.2s" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" },
  card: { backgroundColor: "#1e293b", borderRadius: "10px", padding: "20px", border: "1px solid #334155" },
  cardTitle: { fontSize: "18px", fontWeight: "bold", marginBottom: "16px", color: "#f8fafc", borderBottom: "1px solid #334155", paddingBottom: "10px" },
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #283548" },
  listItemAlert: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #283548" },
  subText: { fontSize: "12px", color: "#94a3b8" },
  subTextAlert: { fontSize: "12px", color: "#fca5a5", margin: "2px 0 0 0" },
  tag: { backgroundColor: "#0284c7", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "600" },
  alertBadge: { backgroundColor: "#ef4444", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "600" },
  activityItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #283548", fontSize: "14px" },
  emptyText: { color: "#94a3b8", fontSize: "14px" },
};