import { useState } from "react";

export default function AdminDashboard() {

  const [adminStats] = useState({
    totalUsers: 156,
    totalPatients: 120,
    totalDoctors: 36,
    activeAccounts: 142,
    inactiveAccounts: 14,
  });

  const [recentRegistrations] = useState([
    { id: "1", name: "Dr. Robert Fox", role: "Doctor", email: "robert.fox@hospital.com", time: "10 mins ago" },
    { id: "2", name: "Alice Cooper", role: "Patient", email: "alice.c@gmail.com", time: "1 hour ago" },
  ]);

  const [auditLogs] = useState([
    { id: "101", action: "User Role Updated", details: "Admin changed user #42 role to Doctor", time: "25 mins ago" },
    { id: "102", action: "Security Alert", details: "Failed login attempt from IP 192.168.1.50", time: "3 hours ago" },
  ]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Admin Control Center</h1>
          <p style={styles.subtitle}>System-wide overview and user management</p>
        </div>
        <div style={styles.badge}>
          <span>System Status: </span>
          <strong style={{ color: "#22c55e" }}>● Operational</strong>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div style={styles.quickActionsRow}>
        <button style={styles.quickBtn} onClick={() => alert("Manage Users")}>
          👥 Manage Users
        </button>
        <button style={styles.quickBtn} onClick={() => alert("Manage Doctors")}>
          🩺 Manage Doctors
        </button>
        <button style={styles.quickBtn} onClick={() => alert("Open Audit Logs")}>
          🛡️ Audit Logs
        </button>
        <button style={styles.quickBtn} onClick={() => alert("Change User Roles")}>
          ⚙️ Change Roles
        </button>
      </div>

      {/* Stats Grid */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Total Users</span>
          <h2 style={styles.statValue}>{adminStats.totalUsers}</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Total Patients</span>
          <h2 style={styles.statValue}>{adminStats.totalPatients}</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Total Doctors</span>
          <h2 style={styles.statValue}>{adminStats.totalDoctors}</h2>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statLabel}>Active / Inactive</span>
          <h2 style={styles.statValue}><span style={{ color: "#22c55e" }}>{adminStats.activeAccounts}</span> / <span style={{ color: "#ef4444" }}>{adminStats.inactiveAccounts}</span></h2>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={styles.grid}>
        {/* Recent Registrations */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Recent Registrations</h3>
          {recentRegistrations.map((user) => (
            <div key={user.id} style={styles.listItem}>
              <div>
                <strong>{user.name}</strong>
                <p style={styles.subText}>{user.email}</p>
              </div>
              <span style={user.role === "Doctor" ? styles.doctorTag : styles.patientTag}>{user.role}</span>
            </div>
          ))}
        </div>

        {/* Audit / Security Activity */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Recent Audit / Security Activity</h3>
          {auditLogs.map((log) => (
            <div key={log.id} style={styles.listItem}>
              <div>
                <strong style={{ color: "#f59e0b" }}>{log.action}</strong>
                <p style={styles.subText}>{log.details}</p>
              </div>
              <span style={styles.subText}>{log.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: "30px", backgroundColor: "#0f172a", minHeight: "100vh", color: "#f8fafc", boxSizing: "border-box" as const },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap" as const, gap: "15px", borderBottom: "1px solid #334155", paddingBottom: "20px" },
  title: { fontSize: "26px", fontWeight: "bold", margin: 0, color: "#f43f5e" }, // لون مميز للإدارة يختلف عن الطبيب
  subtitle: { fontSize: "14px", color: "#94a3b8", margin: "4px 0 0 0" },
  badge: { backgroundColor: "#1e293b", padding: "10px 16px", borderRadius: "8px", border: "1px solid #334155", fontSize: "14px" },
  quickActionsRow: { display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" as const },
  quickBtn: { padding: "10px 16px", backgroundColor: "#1e293b", color: "#f43f5e", border: "1px solid #475569", borderRadius: "8px", fontWeight: "600", cursor: "pointer", transition: "0.2s" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", marginBottom: "24px" },
  statCard: { backgroundColor: "#1e293b", borderRadius: "10px", padding: "20px", border: "1px solid #334155", textAlign: "center" as const },
  statLabel: { fontSize: "13px", color: "#94a3b8", display: "block", marginBottom: "8px" },
  statValue: { fontSize: "24px", fontWeight: "bold", margin: 0, color: "#f8fafc" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" },
  card: { backgroundColor: "#1e293b", borderRadius: "10px", padding: "20px", border: "1px solid #334155" },
  cardTitle: { fontSize: "18px", fontWeight: "bold", marginBottom: "16px", color: "#f8fafc", borderBottom: "1px solid #334155", paddingBottom: "10px" },
  listItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #334155" },
  subText: { fontSize: "12px", color: "#94a3b8", margin: "2px 0 0 0" },
  doctorTag: { backgroundColor: "#0284c7", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "600" },
  patientTag: { backgroundColor: "#10b981", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "600" },
};