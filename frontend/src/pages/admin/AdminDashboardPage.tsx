import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { adminService } from "../../services/admin.service";
import { appointmentService } from "../../services/appointment.service";
import type {
  AccountStatus,
  UserRole,
} from "../../services/auth.service";
import { getBrowserTimeZone } from "../../services/browser-time-zone";
import type {
  AdminDashboard,
  AdminDoctor,
  AdminUser,
  AuditLog,
  DoctorPatientAssignment,
} from "../../types/admin";
import type { Appointment } from "../../types/appointment";

type AdminTab = "overview" | "users" | "doctors" | "assignments" | "appointments" | "audit";

interface UserFormState {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  accountStatus: AccountStatus;
  specialization: string;
  licenseNumber: string;
}

const emptyUserForm: UserFormState = {
  name: "",
  email: "",
  password: "",
  role: "PATIENT",
  accountStatus: "ACTIVE",
  specialization: "",
  licenseNumber: "",
};

const roleOptions: UserRole[] = ["PATIENT", "DOCTOR", "ADMIN"];
const statusOptions: AccountStatus[] = ["ACTIVE", "SUSPENDED", "DISABLED"];

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function statusBadgeClass(status: AccountStatus): string {
  if (status === "ACTIVE") return "badge-completed";
  if (status === "SUSPENDED") return "badge-pending";
  return "badge-cancelled";
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [assignments, setAssignments] = useState<DoctorPatientAssignment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const [dashboardResult, usersResult, doctorsResult, assignmentsResult, appointmentResult, auditResult] =
        await Promise.all([
          adminService.dashboard(),
          adminService.listUsers({ pageSize: 100 }),
          adminService.listDoctors(),
          adminService.listAssignments(1, 100),
          appointmentService.list(),
          adminService.listAuditLogs(),
        ]);
      setDashboard(dashboardResult);
      setUsers(usersResult.items);
      setDoctors(doctorsResult.items);
      setAssignments(assignmentsResult.items);
      setAppointments(appointmentResult);
      setAuditLogs(auditResult.items);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "We could not load administration data. Please try again.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function refreshUsers(): Promise<void> {
    const [userResult, doctorResult, dashboardResult] = await Promise.all([
      adminService.listUsers({ pageSize: 100 }),
      adminService.listDoctors(),
      adminService.dashboard(),
    ]);
    setUsers(userResult.items);
    setDoctors(doctorResult.items);
    setDashboard(dashboardResult);
  }

  async function refreshAssignments(): Promise<void> {
    const [assignmentResult, doctorResult, dashboardResult] = await Promise.all([
      adminService.listAssignments(1, 100),
      adminService.listDoctors(),
      adminService.dashboard(),
    ]);
    setAssignments(assignmentResult.items);
    setDoctors(doctorResult.items);
    setDashboard(dashboardResult);
  }

  async function refreshAppointments(): Promise<void> {
    const [appointmentResult, dashboardResult] = await Promise.all([
      appointmentService.list(),
      adminService.dashboard(),
    ]);
    setAppointments(appointmentResult);
    setDashboard(dashboardResult);
  }

  const tabs: Array<{ id: AdminTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "doctors", label: "Doctors" },
    { id: "assignments", label: "Assignments" },
    { id: "appointments", label: "Appointments" },
    { id: "audit", label: "Audit log" },
  ];

  return (
    <main className="page-shell admin-page-shell">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>CareTrack operations</h1>
          <p>Manage people, clinical access, account safety, and an auditable record of sensitive changes.</p>
        </div>
        <button className="button admin-hero-button" type="button" onClick={() => void loadData()} disabled={isLoading}>
          {isLoading ? "Refreshing…" : "Refresh data"}
        </button>
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <div className="admin-tabs" role="tablist" aria-label="Administration sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`admin-tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && !dashboard ? (
        <div className="card state-card" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <h2>Loading administration data</h2>
          <p>Gathering current users, assignments, and audit activity.</p>
        </div>
      ) : (
        <div role="tabpanel">
          {activeTab === "overview" && dashboard && (
            <OverviewPanel dashboard={dashboard} />
          )}
          {activeTab === "users" && (
            <UsersPanel
              users={users}
              onChanged={refreshUsers}
              onEditDoctor={(user) => {
                setActiveTab("users");
                window.dispatchEvent(new CustomEvent("caretrack:edit-admin-user", { detail: user.id }));
              }}
              setError={setError}
              setMessage={setMessage}
            />
          )}
          {activeTab === "doctors" && (
            <DoctorsPanel
              doctors={doctors}
              users={users}
              onEdit={(userId) => {
                setActiveTab("users");
                window.setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("caretrack:edit-admin-user", { detail: userId }));
                });
              }}
            />
          )}
          {activeTab === "assignments" && (
            <AssignmentsPanel
              doctors={doctors}
              users={users}
              assignments={assignments}
              onChanged={refreshAssignments}
              setError={setError}
              setMessage={setMessage}
            />
          )}
          {activeTab === "appointments" && (
            <AdminAppointmentsPanel
              appointments={appointments}
              doctors={doctors}
              users={users}
              onChanged={refreshAppointments}
              setError={setError}
              setMessage={setMessage}
            />
          )}
          {activeTab === "audit" && <AuditPanel initialLogs={auditLogs} />}
        </div>
      )}
    </main>
  );
}

function OverviewPanel({ dashboard }: { dashboard: AdminDashboard }) {
  const cards = [
    { label: "All users", value: dashboard.summary.users, icon: "U", className: "summary-icon-blue" },
    { label: "Patients", value: dashboard.summary.patients, icon: "P", className: "summary-icon-teal" },
    { label: "Doctors", value: dashboard.summary.doctors, icon: "Dr", className: "summary-icon-violet" },
    { label: "Active assignments", value: dashboard.summary.activeAssignments, icon: "↔", className: "summary-icon-amber" },
    { label: "Security events · 24h", value: dashboard.summary.securityEventsLast24Hours, icon: "!", className: "summary-icon-red" },
  ];

  return (
    <>
      <section className="summary-grid" aria-label="Administration summary">
        {cards.map((card) => (
          <article className="summary-card" key={card.label}>
            <span className={`summary-icon ${card.className}`} aria-hidden="true">{card.icon}</span>
            <div><p>{card.label}</p><strong>{card.value}</strong></div>
          </article>
        ))}
      </section>

      <div className="admin-overview-grid">
        <section className="card data-section">
          <div className="section-heading">
            <p className="eyebrow">Account health</p>
            <h2>Status distribution</h2>
          </div>
          <div className="admin-status-grid">
            <div><span className="badge badge-completed">Active</span><strong>{dashboard.summary.activeUsers}</strong></div>
            <div><span className="badge badge-pending">Suspended</span><strong>{dashboard.summary.suspendedUsers}</strong></div>
            <div><span className="badge badge-cancelled">Disabled</span><strong>{dashboard.summary.disabledUsers}</strong></div>
          </div>
        </section>

        <section className="card data-section">
          <div className="section-heading">
            <p className="eyebrow">Latest changes</p>
            <h2>Recent audit activity</h2>
          </div>
          {dashboard.recentAuditLogs.length === 0 ? (
            <p className="muted-message">No audit events have been recorded.</p>
          ) : (
            <div className="compact-audit-list">
              {dashboard.recentAuditLogs.slice(0, 6).map((log) => (
                <div key={log.id}>
                  <span className="audit-dot" aria-hidden="true" />
                  <span><strong>{formatLabel(log.action)}</strong><small>{log.user?.email ?? "System"} · {formatDate(log.createdAt)}</small></span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card data-section admin-security-activity">
          <div className="section-heading">
            <p className="eyebrow">Security activity</p>
            <h2>Recent access and account events</h2>
            <p>Failed sign-ins, session changes, access grants, and account actions.</p>
          </div>
          {dashboard.recentSecurityActivity.length === 0 ? (
            <div className="monitoring-clear"><span aria-hidden="true">✓</span><div><strong>No recent security events</strong><small>No matching security activity has been recorded.</small></div></div>
          ) : (
            <div className="security-activity-list">
              {dashboard.recentSecurityActivity.slice(0, 8).map((log) => {
                const suspicious = log.action === "LOGIN_FAILED" || log.action === "REFRESH_TOKEN_REUSE" || log.action === "PASSWORD_CHANGE_FAILED";
                return <article className={suspicious ? "is-suspicious" : ""} key={log.id}><span className={`security-activity-icon${suspicious ? " is-warning" : ""}`} aria-hidden="true">{suspicious ? "!" : "i"}</span><div><strong>{formatLabel(log.action)}</strong><small>{log.user?.email ?? "Unknown actor"} · {log.ipAddress || "IP not recorded"} · {formatDate(log.createdAt)}</small></div>{suspicious && <span className="badge badge-cancelled">Review</span>}</article>;
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

interface AdminMutationProps {
  setError: (message: string | null) => void;
  setMessage: (message: string | null) => void;
}

function UsersPanel({
  users,
  onChanged,
  setError,
  setMessage,
}: {
  users: AdminUser[];
  onChanged: () => Promise<void>;
  onEditDoctor: (user: AdminUser) => void;
} & AdminMutationProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "">("");
  const [form, setForm] = useState<UserFormState>(emptyUserForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) =>
      (!query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)) &&
      (!roleFilter || user.role === roleFilter) &&
      (!statusFilter || user.accountStatus === statusFilter),
    );
  }, [roleFilter, search, statusFilter, users]);

  const beginEdit = useCallback((user: AdminUser): void => {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      accountStatus: user.accountStatus,
      specialization: user.doctor?.specialization ?? "",
      licenseNumber: user.doctor?.licenseNumber ?? "",
    });
    setFormError(null);
    window.scrollTo({ top: 210, behavior: "smooth" });
  }, []);

  useEffect(() => {
    function handleExternalEdit(event: Event): void {
      const userId = (event as CustomEvent<string>).detail;
      const user = users.find((item) => item.id === userId);
      if (user) beginEdit(user);
    }
    window.addEventListener("caretrack:edit-admin-user", handleExternalEdit);
    return () => window.removeEventListener("caretrack:edit-admin-user", handleExternalEdit);
  }, [beginEdit, users]);

  function resetForm(): void {
    setEditingId(null);
    setForm(emptyUserForm);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setFormError("Name must contain at least two characters.");
      return;
    }
    if (!editingId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (!editingId && (form.password.length < 8 || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(form.password))) {
      setFormError("The temporary password must use uppercase, lowercase, a number, and at least 8 characters.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    setError(null);
    setMessage(null);

    try {
      if (editingId) {
        await adminService.updateUser(editingId, {
          name: form.name.trim(),
          role: form.role,
          accountStatus: form.accountStatus,
          specialization: form.role === "DOCTOR" ? form.specialization.trim() || null : undefined,
          licenseNumber: form.role === "DOCTOR" ? form.licenseNumber.trim() || null : undefined,
        });
        setMessage("User account updated.");
      } else {
        await adminService.createUser({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role,
          accountStatus: form.accountStatus,
          specialization: form.role === "DOCTOR" ? form.specialization.trim() || null : undefined,
          licenseNumber: form.role === "DOCTOR" ? form.licenseNumber.trim() || null : undefined,
          timeZone: getBrowserTimeZone() ?? undefined,
        });
        setMessage("User account created.");
      }
      await onChanged();
      resetForm();
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, "We could not save this user."));
    } finally {
      setIsSaving(false);
    }
  }

  async function disableUser(user: AdminUser): Promise<void> {
    if (!window.confirm(`Disable ${user.name}'s account?`)) return;
    setError(null);
    setMessage(null);
    try {
      await adminService.deactivateUser(user.id);
      await onChanged();
      setMessage("User account disabled.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not disable this user."));
    }
  }

  return (
    <div className="admin-management-stack">
      <section className="card form-card">
        <div className="section-heading section-heading-actions">
          <div><p className="eyebrow">{editingId ? "Edit account" : "Provision access"}</p><h2>{editingId ? "Update user" : "Create user"}</h2><p>Roles and account status are enforced by the API on every protected request.</p></div>
          {editingId && <button type="button" className="button button-ghost button-small" onClick={resetForm}>Cancel editing</button>}
        </div>
        {formError && <div className="alert alert-error" role="alert">{formError}</div>}
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          <div className="form-grid form-grid-three">
            <label className="field"><span>Name</span><input value={form.name} maxLength={100} disabled={isSaving} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>Email</span><input type="email" value={form.email} maxLength={255} disabled={isSaving || Boolean(editingId)} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
            {!editingId && <label className="field"><span>Temporary password</span><input type="password" value={form.password} maxLength={72} autoComplete="new-password" disabled={isSaving} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /></label>}
            <label className="field"><span>Role</span><select value={form.role} disabled={isSaving} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}>{roleOptions.map((role) => <option value={role} key={role}>{formatLabel(role)}</option>)}</select></label>
            <label className="field"><span>Account status</span><select value={form.accountStatus} disabled={isSaving} onChange={(event) => setForm((current) => ({ ...current, accountStatus: event.target.value as AccountStatus }))}>{statusOptions.map((status) => <option value={status} key={status}>{formatLabel(status)}</option>)}</select></label>
            {form.role === "DOCTOR" && <><label className="field"><span>Specialization</span><input value={form.specialization} maxLength={120} disabled={isSaving} onChange={(event) => setForm((current) => ({ ...current, specialization: event.target.value }))} /></label><label className="field"><span>License number</span><input value={form.licenseNumber} maxLength={100} disabled={isSaving} onChange={(event) => setForm((current) => ({ ...current, licenseNumber: event.target.value }))} /></label></>}
          </div>
          <button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? "Saving…" : editingId ? "Save account" : "Create account"}</button>
        </form>
      </section>

      <section className="card data-section">
        <div className="section-heading"><p className="eyebrow">Directory</p><h2>Users and access</h2></div>
        <div className="filter-bar card admin-filter-bar">
          <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" aria-label="Search users" /></label>
          <label className="compact-field"><span className="sr-only">Filter role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | "")}><option value="">All roles</option>{roleOptions.map((role) => <option key={role} value={role}>{formatLabel(role)}</option>)}</select></label>
          <label className="compact-field"><span className="sr-only">Filter status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AccountStatus | "")}><option value="">All statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}</select></label>
        </div>
        <div className="table-wrap"><table className="data-table admin-user-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Email</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><strong>{user.name}</strong></td><td><span className="badge badge-info">{formatLabel(user.role)}</span></td><td><span className={`badge ${statusBadgeClass(user.accountStatus)}`}>{formatLabel(user.accountStatus)}</span></td><td>{user.email}<small className="table-secondary">{user.emailVerifiedAt ? "Verified email" : "Unverified email"}</small></td><td>{formatDate(user.createdAt)}</td><td><div className="row-actions"><button type="button" className="button button-secondary button-small" onClick={() => beginEdit(user)}>Edit</button>{user.accountStatus !== "DISABLED" && <button type="button" className="button button-danger-ghost button-small" onClick={() => void disableUser(user)}>Disable</button>}</div></td></tr>)}</tbody></table></div>
        {filteredUsers.length === 0 && <p className="muted-message">No users match these filters.</p>}
      </section>
    </div>
  );
}

function DoctorsPanel({ doctors, users, onEdit }: { doctors: AdminDoctor[]; users: AdminUser[]; onEdit: (userId: string) => void }) {
  return (
    <section className="card data-section">
      <div className="section-heading"><p className="eyebrow">Clinical team</p><h2>Doctors</h2><p>Maintain professional details and review active patient access.</p></div>
      {doctors.length === 0 ? <div className="inline-state"><span className="state-icon" aria-hidden="true">Dr</span><h3>No doctors</h3><p>Create a user with the Doctor role to add them here.</p></div> : <div className="doctor-admin-grid">{doctors.map((doctor) => <article className="doctor-admin-card" key={doctor.id}><div className="doctor-avatar" aria-hidden="true">{doctor.user.name.charAt(0).toUpperCase()}</div><div><span className={`badge ${statusBadgeClass(doctor.user.accountStatus)}`}>{formatLabel(doctor.user.accountStatus)}</span><h3>Dr. {doctor.user.name}</h3><p>{doctor.user.email}</p><dl className="mini-detail-list"><div><dt>Specialization</dt><dd>{doctor.specialization || "Not set"}</dd></div><div><dt>License</dt><dd>{doctor.licenseNumber || "Not set"}</dd></div><div><dt>Assigned patients</dt><dd>{doctor.assignedPatientCount}</dd></div></dl><button type="button" className="button button-secondary button-small" onClick={() => onEdit(doctor.userId)} disabled={!users.some((user) => user.id === doctor.userId)}>Edit profile</button></div></article>)}</div>}
    </section>
  );
}

function AssignmentsPanel({ doctors, users, assignments, onChanged, setError, setMessage }: { doctors: AdminDoctor[]; users: AdminUser[]; assignments: DoctorPatientAssignment[]; onChanged: () => Promise<void> } & AdminMutationProps) {
  const [doctorId, setDoctorId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const patients = users.filter((user) => user.role === "PATIENT" && user.accountStatus === "ACTIVE" && user.patient);

  async function assign(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!doctorId || !patientId) { setError("Choose both a doctor and patient."); return; }
    setMutationKey("create"); setError(null); setMessage(null);
    try { await adminService.createAssignment(doctorId, patientId); await onChanged(); setDoctorId(""); setPatientId(""); setMessage("Doctor assigned to patient."); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "We could not create this assignment.")); }
    finally { setMutationKey(null); }
  }

  async function revoke(assignment: DoctorPatientAssignment): Promise<void> {
    if (!window.confirm(`Revoke Dr. ${assignment.doctor.user.name}'s access to ${assignment.patient.user.name}?`)) return;
    setMutationKey(assignment.id); setError(null); setMessage(null);
    try { await adminService.revokeAssignment(assignment.doctorId, assignment.patientId); await onChanged(); setMessage("Doctor access revoked."); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "We could not revoke this assignment.")); }
    finally { setMutationKey(null); }
  }

  return <div className="admin-management-stack"><section className="card form-card"><div className="section-heading"><p className="eyebrow">Grant access</p><h2>Assign doctor to patient</h2><p>Only active assignments allow a doctor to read that patient’s clinical data.</p></div><form className="form-grid assignment-form" onSubmit={assign}><label className="field"><span>Doctor</span><select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} disabled={mutationKey !== null}><option value="">Choose a doctor</option>{doctors.filter((doctor) => doctor.user.accountStatus === "ACTIVE").map((doctor) => <option key={doctor.id} value={doctor.id}>Dr. {doctor.user.name}{doctor.specialization ? ` — ${doctor.specialization}` : ""}</option>)}</select></label><label className="field"><span>Patient</span><select value={patientId} onChange={(event) => setPatientId(event.target.value)} disabled={mutationKey !== null}><option value="">Choose a patient</option>{patients.map((patient) => <option key={patient.patient?.id} value={patient.patient?.id}>{patient.name} — {patient.email}</option>)}</select></label><div className="form-actions field-wide"><button type="submit" className="button button-primary" disabled={mutationKey !== null}>{mutationKey === "create" ? "Assigning…" : "Grant patient access"}</button></div></form></section><section className="card data-section"><div className="section-heading"><p className="eyebrow">Access ledger</p><h2>Doctor–patient assignments</h2></div>{assignments.length === 0 ? <div className="inline-state"><span className="state-icon" aria-hidden="true">↔</span><h3>No assignments</h3><p>Use the form above to grant a doctor access.</p></div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Doctor</th><th>Patient</th><th>Granted</th><th>Status</th><th>Actions</th></tr></thead><tbody>{assignments.map((assignment) => <tr key={assignment.id}><td><strong>Dr. {assignment.doctor.user.name}</strong><small className="table-secondary">{assignment.doctor.user.email}</small></td><td><strong>{assignment.patient.user.name}</strong><small className="table-secondary">{assignment.patient.user.email}</small></td><td>{formatDate(assignment.grantedAt)}</td><td><span className={`badge ${assignment.active ? "badge-completed" : "badge-cancelled"}`}>{assignment.active ? "Active" : "Revoked"}</span></td><td><div className="row-actions">{assignment.active && <button type="button" className="button button-danger-ghost button-small" disabled={mutationKey !== null} onClick={() => void revoke(assignment)}>{mutationKey === assignment.id ? "Revoking…" : "Revoke"}</button>}</div></td></tr>)}</tbody></table></div>}</section></div>;
}

function AdminAppointmentsPanel({ appointments, doctors, users, onChanged, setError, setMessage }: { appointments: Appointment[]; doctors: AdminDoctor[]; users: AdminUser[]; onChanged: () => Promise<void> } & AdminMutationProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const patients = users.filter((user) => user.role === "PATIENT" && user.accountStatus === "ACTIVE" && user.patient);
  const orderedAppointments = useMemo(() => [...appointments].sort((first, second) => Date.parse(first.appointmentDate) - Date.parse(second.appointmentDate)), [appointments]);

  function clearForm(): void {
    setEditingId(null); setPatientId(""); setDoctorId(""); setAppointmentDate(""); setNotes("");
  }

  function beginEdit(appointment: Appointment): void {
    setEditingId(appointment.id); setPatientId(appointment.patientId); setDoctorId(appointment.doctorId); setAppointmentDate(toDateTimeLocal(appointment.appointmentDate)); setNotes(appointment.notes ?? ""); setError(null); window.scrollTo({ top: 220, behavior: "smooth" });
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!appointmentDate || Date.parse(appointmentDate) <= Date.now() || (!editingId && (!patientId || !doctorId))) { setError("Choose a patient, doctor, and future appointment time."); return; }
    setMutationKey("save"); setError(null); setMessage(null);
    try {
      if (editingId) await appointmentService.update(editingId, { appointmentDate: new Date(appointmentDate).toISOString(), notes: notes.trim() || null });
      else await appointmentService.create({ patientId, doctorId, appointmentDate: new Date(appointmentDate).toISOString(), notes: notes.trim() || null });
      await onChanged(); setMessage(editingId ? "Appointment updated." : "Appointment created."); clearForm();
    } catch (requestError) { setError(getApiErrorMessage(requestError, "We could not save this appointment.")); }
    finally { setMutationKey(null); }
  }

  async function updateStatus(appointment: Appointment, status: "COMPLETED" | "CANCELLED"): Promise<void> {
    setMutationKey(appointment.id); setError(null); setMessage(null);
    try { await appointmentService.update(appointment.id, { status }); await onChanged(); setMessage(`Appointment marked ${status.toLowerCase()}.`); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "We could not update this appointment.")); }
    finally { setMutationKey(null); }
  }

  async function remove(appointment: Appointment): Promise<void> {
    if (!window.confirm("Permanently delete this appointment and its audit-linked record?")) return;
    setMutationKey(appointment.id); setError(null); setMessage(null);
    try { await appointmentService.remove(appointment.id); await onChanged(); if (editingId === appointment.id) clearForm(); setMessage("Appointment deleted."); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "We could not delete this appointment.")); }
    finally { setMutationKey(null); }
  }

  return <div className="admin-management-stack"><section className="card form-card"><div className="section-heading section-heading-actions"><div><p className="eyebrow">{editingId ? "Edit visit" : "Create visit"}</p><h2>{editingId ? "Reschedule appointment" : "Add appointment"}</h2><p>Administrators can coordinate visits across active patient and doctor profiles.</p></div>{editingId && <button type="button" className="button button-ghost button-small" onClick={clearForm}>Cancel editing</button>}</div><form className="doctor-appointment-form admin-appointment-form" onSubmit={save}><label className="field"><span>Patient</span><select value={patientId} onChange={(event) => setPatientId(event.target.value)} disabled={mutationKey !== null || Boolean(editingId)}><option value="">Choose patient</option>{patients.map((patient) => <option key={patient.patient!.id} value={patient.patient!.id}>{patient.name}</option>)}</select></label><label className="field"><span>Doctor</span><select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} disabled={mutationKey !== null || Boolean(editingId)}><option value="">Choose doctor</option>{doctors.filter((doctor) => doctor.user.accountStatus === "ACTIVE").map((doctor) => <option value={doctor.id} key={doctor.id}>Dr. {doctor.user.name}</option>)}</select></label><label className="field"><span>Date and time</span><input type="datetime-local" min={toDateTimeLocal(new Date().toISOString())} value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} disabled={mutationKey !== null} /></label><label className="field"><span>Notes</span><input value={notes} maxLength={2_000} onChange={(event) => setNotes(event.target.value)} disabled={mutationKey !== null} /></label><button className="button button-primary" type="submit" disabled={mutationKey !== null}>{mutationKey === "save" ? "Saving…" : editingId ? "Save changes" : "Create"}</button></form></section><section className="card data-section"><div className="section-heading"><p className="eyebrow">All visits</p><h2>Appointment management</h2></div>{orderedAppointments.length === 0 ? <div className="inline-state"><span className="state-icon" aria-hidden="true">Cal</span><h3>No appointments</h3><p>Use the form above to create one.</p></div> : <div className="table-wrap"><table className="data-table admin-appointment-table"><thead><tr><th>Date</th><th>Patient</th><th>Doctor</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead><tbody>{orderedAppointments.map((appointment) => <tr key={appointment.id}><td>{formatDate(appointment.appointmentDate)}</td><td><strong>{appointment.patient.user.name}</strong></td><td>Dr. {appointment.doctor.user.name}</td><td><span className={`badge badge-${appointment.status.toLowerCase()}`}>{formatLabel(appointment.status)}</span></td><td>{appointment.notes || "—"}</td><td><div className="row-actions"><button type="button" className="button button-secondary button-small" onClick={() => beginEdit(appointment)} disabled={mutationKey !== null || appointment.status !== "SCHEDULED"}>Edit</button>{appointment.status === "SCHEDULED" && <><button type="button" className="button button-ghost button-small" onClick={() => void updateStatus(appointment, "COMPLETED")} disabled={mutationKey !== null}>Complete</button><button type="button" className="button button-danger-ghost button-small" onClick={() => void updateStatus(appointment, "CANCELLED")} disabled={mutationKey !== null}>Cancel</button></>}<button type="button" className="icon-button icon-button-danger" aria-label={`Delete appointment for ${appointment.patient.user.name}`} onClick={() => void remove(appointment)} disabled={mutationKey !== null}>×</button></div></td></tr>)}</tbody></table></div>}</section></div>;
}

function AuditPanel({ initialLogs }: { initialLogs: AuditLog[] }) {
  const [logs, setLogs] = useState(initialLogs);
  const [action, setAction] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function searchLogs(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setIsLoading(true); setError(null);
    try { const result = await adminService.listAuditLogs(1, 50, action.trim() || undefined); setLogs(result.items); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "We could not search audit logs.")); }
    finally { setIsLoading(false); }
  }

  return <section className="card data-section"><div className="section-heading"><p className="eyebrow">Security record</p><h2>Audit log</h2><p>Review account, access, and clinical administration events.</p></div>{error && <div className="alert alert-error" role="alert">{error}</div>}<form className="audit-search" onSubmit={searchLogs}><label className="search-field"><span aria-hidden="true">⌕</span><input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Filter by action" aria-label="Filter audit logs by action" /></label><button className="button button-secondary" type="submit" disabled={isLoading}>{isLoading ? "Searching…" : "Search"}</button></form>{logs.length === 0 ? <div className="inline-state"><span className="state-icon" aria-hidden="true">i</span><h3>No audit events</h3><p>No activity matches this filter.</p></div> : <div className="table-wrap"><table className="data-table audit-table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Context</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td>{log.user ? <><strong>{log.user.name}</strong><small className="table-secondary">{log.user.email}</small></> : "System"}</td><td><span className="badge badge-info">{formatLabel(log.action)}</span></td><td>{log.entity ? `${formatLabel(log.entity)}${log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}` : "—"}</td><td><small className="audit-context">{log.ipAddress || "No IP"}{log.metadata ? ` · ${JSON.stringify(log.metadata)}` : ""}</small></td></tr>)}</tbody></table></div>}</section>;
}
