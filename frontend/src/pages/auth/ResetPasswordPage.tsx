import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthPageShell from "../../components/auth/AuthPageShell";
import { getApiErrorMessage } from "../../services/api-error";
import { authService } from "../../services/auth.service";

interface ResetErrors {
  password?: string;
  confirmPassword?: string;
  form?: string;
}

export default function ResetPasswordPage() {
  const [token] = useState(readOneTimeToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<ResetErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      document.title,
      window.location.pathname,
    );
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const nextErrors: ResetErrors = {};

    if (!token) nextErrors.form = "This password reset link is incomplete.";
    if (password.length < 8)
      nextErrors.password = "Password must contain at least 8 characters.";
    else if (password.length > 72)
      nextErrors.password = "Password must contain at most 72 characters.";
    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(password)) {
      nextErrors.password =
        "Use uppercase, lowercase, and at least one number.";
    }
    if (confirmPassword !== password)
      nextErrors.confirmPassword = "Passwords do not match.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await authService.resetPassword(token, password);
      setIsComplete(true);
    } catch (error) {
      setErrors({
        form: getApiErrorMessage(
          error,
          "This password reset link is invalid or has expired.",
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Choose a password"
      title="Set your new password"
      description="Use a unique password that you do not use for another account."
    >
      {isComplete ? (
        <div className="auth-result" role="status">
          <span className="state-icon" aria-hidden="true">
            ✓
          </span>
          <h2>Password updated</h2>
          <p>
            Your old sessions have been closed. Sign in with your new password.
          </p>
          <Link className="button button-primary full-width" to="/login">
            Sign in
          </Link>
        </div>
      ) : (
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          {errors.form && (
            <div className="alert alert-error" role="alert">
              {errors.form}
            </div>
          )}
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              maxLength={72}
              disabled={isLoading || !token}
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password ? (
              <small className="field-error">{errors.password}</small>
            ) : (
              <small>Use uppercase, lowercase, and a number.</small>
            )}
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              maxLength={72}
              disabled={isLoading || !token}
              aria-invalid={Boolean(errors.confirmPassword)}
            />
            {errors.confirmPassword && (
              <small className="field-error">{errors.confirmPassword}</small>
            )}
          </label>
          <button
            className="button button-primary button-large full-width"
            type="submit"
            disabled={isLoading || !token}
          >
            {isLoading ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
      {!isComplete && (
        <p className="auth-footer">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      )}
    </AuthPageShell>
  );
}

function readOneTimeToken(): string {
  const fragment = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  return (
    new URLSearchParams(fragment).get("token") ??
    new URLSearchParams(window.location.search).get("token") ??
    ""
  );
}
