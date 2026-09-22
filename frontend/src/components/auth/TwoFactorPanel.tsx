import { type FormEvent, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import {
  authService,
  type AuthenticatorSetup,
  type TwoFactorStatus,
} from "../../services/auth.service";
import { useAuth } from "./auth-context";

export default function TwoFactorPanel() {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<AuthenticatorSetup | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user.role === "PATIENT") return;
    void authService
      .getTwoFactorStatus()
      .then(setStatus)
      .catch((requestError) =>
        setError(
          getApiErrorMessage(
            requestError,
            "Two-factor settings could not be loaded.",
          ),
        ),
      );
  }, [user.role]);

  if (user.role === "PATIENT") return null;

  async function enableEmail(): Promise<void> {
    if (!currentPassword) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authService.enableEmailTwoFactor(currentPassword);
      setMessage(result);
      window.setTimeout(logout, 1_200);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Email OTP could not be enabled."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function startAuthenticator(): Promise<void> {
    if (!currentPassword) return;
    setBusy(true);
    setError(null);
    try {
      setSetup(await authService.beginAuthenticatorSetup(currentPassword));
      setCode("");
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Authenticator setup could not be started.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmAuthenticator(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!setup || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authService.confirmAuthenticatorSetup(
        setup.challengeId,
        code,
      );
      setMessage(result);
      window.setTimeout(logout, 1_200);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Authenticator code was not valid."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<void> {
    if (!currentPassword) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authService.disableTwoFactor(
        currentPassword,
        code || undefined,
      );
      setMessage(result);
      window.setTimeout(logout, 1_200);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Two-factor authentication could not be disabled.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card form-card" aria-labelledby="two-factor-title">
      <div className="section-heading">
        <p className="eyebrow">Doctor and admin protection</p>
        <h2 id="two-factor-title">Two-factor authentication</h2>
        <p>
          Require an email code or authenticator-app code after your password.
          Changing this setting signs every device out.
        </p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {!status ? (
        <div className="inline-state">
          <span className="spinner" aria-hidden="true" />
          <p>Loading two-factor settings…</p>
        </div>
      ) : (
        <div className="form-stack">
          <div className="badge-row">
            <span
              className={`badge ${status.enabled ? "badge-completed" : "badge-pending"}`}
            >
              {status.enabled
                ? `${status.method === "EMAIL_OTP" ? "Email OTP" : "Authenticator app"} enabled`
                : "Not enabled"}
            </span>
          </div>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              maxLength={72}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={busy}
            />
          </label>
          {setup && (
            <form className="form-stack" onSubmit={confirmAuthenticator}>
              <div className="alert alert-info">
                Add this setup key in your authenticator app, then enter its
                current code. <strong>{setup.secret}</strong>
              </div>
              <label className="field">
                <span>Authenticator code</span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </label>
              <button
                type="submit"
                className="button button-primary"
                disabled={busy || code.length !== 6}
              >
                Confirm authenticator
              </button>
            </form>
          )}
          {status.enabled && status.method === "AUTHENTICATOR" && !setup && (
            <label className="field">
              <span>Authenticator code to disable</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
            </label>
          )}
          {!setup && (
            <div className="row-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || !currentPassword}
                onClick={() => void enableEmail()}
              >
                Use email OTP
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || !currentPassword}
                onClick={() => void startAuthenticator()}
              >
                Set up authenticator
              </button>
              {status.enabled && (
                <button
                  type="button"
                  className="button button-danger-ghost"
                  disabled={
                    busy ||
                    !currentPassword ||
                    (status.method === "AUTHENTICATOR" && code.length !== 6)
                  }
                  onClick={() => void disable()}
                >
                  Disable 2FA
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
