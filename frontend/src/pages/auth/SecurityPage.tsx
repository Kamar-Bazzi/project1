import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "../../components/auth/auth-context";
import { getApiErrorMessage } from "../../services/api-error";
import {
  authService,
  type AuthSession,
  type SecurityEvent,
} from "../../services/auth.service";

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

function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown browser";

  const browser = userAgent.includes("Edg/")
    ? "Microsoft Edge"
    : userAgent.includes("Firefox/")
      ? "Firefox"
      : userAgent.includes("Chrome/")
        ? "Chrome"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Web browser";
  const platform = userAgent.includes("Windows")
    ? "Windows"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : userAgent.includes("Android")
        ? "Android"
        : userAgent.includes("Mac OS")
          ? "macOS"
          : "Unknown device";

  return `${browser} on ${platform}`;
}

export default function SecurityPage() {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mutationId, setMutationId] = useState<string | null>(null);
  const [isRequestingVerification, setIsRequestingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const loadSessions = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const [sessionResult, eventResult] = await Promise.all([
        authService.listSessions(),
        authService.listSecurityEvents(),
      ]);
      setSessions(sessionResult);
      setSecurityEvents(eventResult);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "We could not load your active sessions.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function requestVerification(): Promise<void> {
    setIsRequestingVerification(true);
    setError(null);
    setMessage(null);

    try {
      const responseMessage = await authService.requestEmailVerification();
      setMessage(responseMessage || "Verification email sent.");
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "We could not send a verification email.",
        ),
      );
    } finally {
      setIsRequestingVerification(false);
    }
  }

  async function revokeSession(session: AuthSession): Promise<void> {
    if (!window.confirm(session.current ? "Sign out this device?" : "Revoke this device session?")) return;

    setMutationId(session.id);
    setError(null);
    setMessage(null);

    try {
      await authService.revokeSession(session.id);
      if (session.current) {
        logout();
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
      setMessage("Session revoked.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not revoke this session."));
    } finally {
      setMutationId(null);
    }
  }

  async function revokeOtherSessions(): Promise<void> {
    if (!window.confirm("Sign out every other device?")) return;

    setMutationId("others");
    setError(null);
    setMessage(null);

    try {
      await authService.revokeOtherSessions();
      setSessions((current) => current.filter((session) => session.current));
      setMessage("Other sessions revoked.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not revoke other sessions."));
    } finally {
      setMutationId(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (newPassword.length < 8 || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(newPassword)) {
      setError("Your new password must use uppercase, lowercase, a number, and at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Choose a new password that differs from your current password.");
      return;
    }

    setIsChangingPassword(true); setError(null); setMessage(null);
    try {
      const responseMessage = await authService.changePassword(currentPassword, newPassword);
      setMessage(responseMessage || "Password changed. You will be asked to sign in again.");
      window.setTimeout(logout, 1_200);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not change your password."));
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <main className="page-shell page-shell-narrow">
      <header className="page-heading">
        <p className="eyebrow">Account protection</p>
        <h1>Security and sessions</h1>
        <p>Verify your recovery address and control every device that can access your CareTrack account.</p>
      </header>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <section className="card security-email-card" aria-labelledby="email-security-title">
        <div className="security-icon" aria-hidden="true">@</div>
        <div>
          <p className="eyebrow">Recovery address</p>
          <h2 id="email-security-title">Email verification</h2>
          <p><strong>{user.email}</strong></p>
          {user.emailVerified ? (
            <span className="badge badge-completed">Verified</span>
          ) : (
            <span className="badge badge-pending">Verification needed</span>
          )}
        </div>
        {!user.emailVerified && (
          <button type="button" className="button button-primary" onClick={() => void requestVerification()} disabled={isRequestingVerification}>
            {isRequestingVerification ? "Sending…" : "Send verification email"}
          </button>
        )}
      </section>

      <section className="card data-section" aria-labelledby="sessions-title">
        <div className="section-heading section-heading-actions">
          <div>
            <p className="eyebrow">Devices</p>
            <h2 id="sessions-title">Active sessions</h2>
            <p>Sessions expire automatically. Revoke anything you do not recognize.</p>
          </div>
          <div className="row-actions">
            <button type="button" className="button button-secondary button-small" onClick={() => void loadSessions()} disabled={isLoading}>Refresh</button>
            <button type="button" className="button button-danger-ghost button-small" onClick={() => void revokeOtherSessions()} disabled={mutationId !== null || sessions.filter((session) => !session.current).length === 0}>
              {mutationId === "others" ? "Revoking…" : "Sign out other devices"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="inline-state" aria-live="polite"><span className="spinner" aria-hidden="true" /><p>Loading active sessions…</p></div>
        ) : sessions.length === 0 ? (
          <div className="inline-state"><span className="state-icon" aria-hidden="true">i</span><h3>No session records</h3><p>Your current session may have expired. Refresh or sign in again.</p></div>
        ) : (
          <div className="session-list">
            {sessions.map((session) => (
              <article className="session-item" key={session.id}>
                <span className="session-device-icon" aria-hidden="true">▣</span>
                <div className="session-copy">
                  <div className="badge-row">
                    <h3>{describeDevice(session.userAgent)}</h3>
                    {session.current && <span className="badge badge-active">This device</span>}
                  </div>
                  <p>{session.createdByIp || "IP address unavailable"}</p>
                  <small>Last active {formatDate(session.lastUsedAt)} · Expires {formatDate(session.expiresAt)}</small>
                </div>
                <button type="button" className="button button-danger-ghost button-small" onClick={() => void revokeSession(session)} disabled={mutationId !== null}>
                  {mutationId === session.id ? "Revoking…" : session.current ? "Sign out" : "Revoke"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card data-section security-events-section" aria-labelledby="security-events-title">
        <div className="section-heading"><p className="eyebrow">Sign-in activity</p><h2 id="security-events-title">Security events</h2><p>Review authentication activity and immediately revoke sessions you do not recognize.</p></div>
        {securityEvents.length === 0 ? <div className="inline-state"><span className="state-icon" aria-hidden="true">✓</span><h3>No recent security events</h3><p>New sign-ins and security-sensitive account activity will appear here.</p></div> : <div className="security-event-list">{securityEvents.map((event) => { const suspicious = event.metadata?.suspicious === true; return <article key={event.id} className={`security-event-item${suspicious ? " is-suspicious" : ""}`}><span className="security-event-icon" aria-hidden="true">{suspicious ? "!" : "✓"}</span><div><div className="badge-row"><h3>{event.action.replace(/_/g, " ").toLowerCase().replace(/^./, (character) => character.toUpperCase())}</h3>{suspicious && <span className="badge badge-cancelled">Suspicious</span>}</div><p>{describeDevice(event.userAgent)} · {event.ipAddress || "IP unavailable"}</p>{event.metadata?.reason && <strong>{event.metadata.reason}</strong>}<time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></div></article>; })}</div>}
      </section>

      <section className="card form-card password-change-card" aria-labelledby="change-password-title">
        <div className="section-heading"><p className="eyebrow">Credentials</p><h2 id="change-password-title">Change password</h2><p>Changing your password closes every active session, including this device.</p></div>
        <form className="form-stack" onSubmit={changePassword} noValidate><div className="form-grid form-grid-three"><label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} maxLength={72} onChange={(event) => setCurrentPassword(event.target.value)} disabled={isChangingPassword} /></label><label className="field"><span>New password</span><input type="password" autoComplete="new-password" value={newPassword} maxLength={72} onChange={(event) => setNewPassword(event.target.value)} disabled={isChangingPassword} /><small>Use uppercase, lowercase, and a number.</small></label><label className="field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirmPassword} maxLength={72} onChange={(event) => setConfirmPassword(event.target.value)} disabled={isChangingPassword} /></label></div><button type="submit" className="button button-primary" disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}>{isChangingPassword ? "Changing password…" : "Change password and sign out"}</button></form>
      </section>
    </main>
  );
}
