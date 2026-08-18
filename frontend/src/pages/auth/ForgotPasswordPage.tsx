import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import AuthPageShell from "../../components/auth/AuthPageShell";
import { getApiErrorMessage } from "../../services/api-error";
import { authService } from "../../services/auth.service";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const responseMessage = await authService.forgotPassword(normalizedEmail);
      setMessage(
        responseMessage ||
          "If an account matches that email, password reset instructions are on the way.",
      );
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "We could not start password recovery. Please try again.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your account email and we’ll send a time-limited recovery link."
    >
      {message ? (
        <div className="auth-result" role="status">
          <span className="state-icon" aria-hidden="true">✓</span>
          <h2>Check your email</h2>
          <p>{message}</p>
          <Link className="button button-primary full-width" to="/login">Return to sign in</Link>
        </div>
      ) : (
        <form className="form-stack" onSubmit={handleSubmit} noValidate>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <label className="field">
            <span>Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              maxLength={255}
              disabled={isLoading}
            />
          </label>
          <button className="button button-primary button-large full-width" type="submit" disabled={isLoading}>
            {isLoading ? "Sending…" : "Send recovery link"}
          </button>
        </form>
      )}
      {!message && <p className="auth-footer"><Link to="/login">Back to sign in</Link></p>}
    </AuthPageShell>
  );
}
