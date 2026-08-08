import { Link } from "react-router-dom";
import { useAuth } from "../../components/auth/auth-context";
import HealthAlertsPanel from "../../components/health/HealthAlertsPanel";
import WearableHealthSection from "../../components/health/WearableHealthSection";
import MedicationCard from "../../components/medications/MedicationCard";
import { useMedications } from "../../services/use-medications";
import { getTodaysMedicationLogs } from "../../types/medication";

function greetingForCurrentTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function PatientDashboardPage() {
  const { user } = useAuth();
  const {
    medications,
    isLoading,
    error,
    actionError,
    mutationKey,
    refresh,
    updateMedicationLogStatus,
  } = useMedications();
  const activeMedications = medications.filter(
    (medication) => medication.status === "ACTIVE",
  );
  const todaysMedications = activeMedications.filter(
    (medication) => getTodaysMedicationLogs(medication).length > 0,
  );
  const todaysLogs = todaysMedications.flatMap((medication) =>
    getTodaysMedicationLogs(medication),
  );
  const takenCount = todaysLogs.filter((log) => log.status === "TAKEN").length;
  const pendingCount = todaysLogs.filter((log) => log.status === "PENDING").length;
  const attentionCount = todaysLogs.filter(
    (log) => log.status === "MISSED" || log.status === "SKIPPED",
  ).length;
  const firstName = user.name.trim().split(/\s+/, 1)[0];

  return (
    <main className="page-shell">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">{greetingForCurrentTime()}</p>
          <h1>{firstName}, here&apos;s your day.</h1>
          <p>Stay on top of your treatment and keep your care information current.</p>
        </div>
        <div className="hero-date" aria-label="Today">
          <span>{new Date().toLocaleDateString([], { weekday: "long" })}</span>
          <strong>
            {new Date().toLocaleDateString([], {
              month: "short",
              day: "numeric",
            })}
          </strong>
        </div>
      </header>

      {actionError && <div className="alert alert-error" role="alert">{actionError}</div>}

      <section className="summary-grid" aria-label="Today's medication summary">
        <article className="summary-card">
          <span className="summary-icon summary-icon-blue" aria-hidden="true">Rx</span>
          <div><p>Active medications</p><strong>{activeMedications.length}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-teal" aria-hidden="true">✓</span>
          <div><p>Doses taken</p><strong>{takenCount}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-violet" aria-hidden="true">◷</span>
          <div><p>Doses pending</p><strong>{pendingCount}</strong></div>
        </article>
        <article className="summary-card">
          <span className="summary-icon summary-icon-amber" aria-hidden="true">!</span>
          <div><p>Needs attention</p><strong>{attentionCount}</strong></div>
        </article>
      </section>

      <WearableHealthSection />

      <div className="dashboard-content-grid">
        <section className="dashboard-primary-column">
          <div className="section-heading section-heading-actions">
            <div>
              <p className="eyebrow">Treatment</p>
              <h2>Today&apos;s medications</h2>
              <p>Update each dose as you move through your day.</p>
            </div>
            <Link className="button button-secondary button-small" to="/medications">
              Manage all
            </Link>
          </div>

          {isLoading ? (
            <div className="card inline-state" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <p>Loading today&apos;s medications…</p>
            </div>
          ) : error ? (
            <div className="card inline-state" role="alert">
              <span className="state-icon" aria-hidden="true">!</span>
              <h3>Medication summary unavailable</h3>
              <p>{error}</p>
              <button className="button button-primary" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          ) : todaysMedications.length === 0 ? (
            <div className="card inline-state empty-state">
              <span className="state-icon" aria-hidden="true">✓</span>
              <h3>No doses scheduled today</h3>
              <p>Add or review medications in your treatment plan.</p>
              <Link className="button button-primary" to="/medications">
                View medications
              </Link>
            </div>
          ) : (
            <div className="dashboard-medication-list">
              {todaysMedications.map((medication) => (
                <MedicationCard
                  key={medication.id}
                  medication={medication}
                  mutationKey={mutationKey}
                  onUpdateLogStatus={updateMedicationLogStatus}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="dashboard-side-column">
          <HealthAlertsPanel compact />

          <section className="card quick-actions-card">
            <div className="section-heading">
              <p className="eyebrow">Quick actions</p>
              <h2>What would you like to do?</h2>
            </div>
            <Link className="quick-action" to="/measurements">
              <span className="quick-action-icon summary-icon-teal" aria-hidden="true">＋</span>
              <span><strong>Record a measurement</strong><small>Blood pressure, weight, glucose, and more</small></span>
              <span aria-hidden="true">›</span>
            </Link>
            <Link className="quick-action" to="/medications">
              <span className="quick-action-icon summary-icon-blue" aria-hidden="true">Rx</span>
              <span><strong>Add a medication</strong><small>Update your treatment and schedules</small></span>
              <span aria-hidden="true">›</span>
            </Link>
            <Link className="quick-action" to="/profile">
              <span className="quick-action-icon summary-icon-violet" aria-hidden="true">○</span>
              <span><strong>Update your profile</strong><small>Contact and emergency information</small></span>
              <span aria-hidden="true">›</span>
            </Link>
            <Link className="quick-action" to="/wearables">
              <span className="quick-action-icon summary-icon-amber" aria-hidden="true">⌚</span>
              <span><strong>Manage wearables</strong><small>Connect and synchronize health devices</small></span>
              <span aria-hidden="true">›</span>
            </Link>
          </section>

          <section className="card care-tip-card">
            <p className="eyebrow">Daily reminder</p>
            <h2>Consistency supports better care.</h2>
            <p>Record doses and measurements when they happen so your history remains accurate.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
