import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../services/api-error";
import { getRoleHomePath } from "../../services/auth-routing";
import { setAccessToken } from "../../services/auth-storage";
import { authService } from "../../services/auth.service";

interface LoginErrors {
  email?: string;
  password?: string;
  form?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  function validateForm(): LoginErrors {
    const nextErrors: LoginErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) nextErrors.email = "Email is required.";
    else if (trimmedEmail.length > 255) nextErrors.email = "Email must contain at most 255 characters.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) nextErrors.email = "Enter a valid email address.";

    if (!password) nextErrors.password = "Password is required.";
    else if (password.length < 8) nextErrors.password = "Password must contain at least 8 characters.";
    else if (password.length > 72) nextErrors.password = "Password must contain at most 72 characters.";

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validateForm();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const authentication = await authService.login({
        email: email.trim().toLowerCase(),
        password,
      });
      setAccessToken(authentication.accessToken);
      navigate(getRoleHomePath(authentication.user.role), { replace: true });
    } catch (error) {
      setErrors({
        form: getApiErrorMessage(error, "Login failed. Please try again."),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <AuthWelcome />
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-heading">
          <p className="eyebrow">Welcome back</p>
          <h1 id="login-title">Sign in to CareTrack</h1>
          <span>Access your private health tracking workspace.</span>
        </div>

        {errors.form && <div className="alert alert-error" role="alert">{errors.form}</div>}

        <form onSubmit={handleSubmit} className="form-stack" noValidate>
          <label className="field">
            <span>Email address</span>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={isLoading}
              autoComplete="email"
              maxLength={255}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "login-email-error" : undefined}
            />
            {errors.email && <small id="login-email-error" className="field-error">{errors.email}</small>}
          </label>

          <label className="field">
            <span>Password</span>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              disabled={isLoading}
              autoComplete="current-password"
              maxLength={72}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "login-password-error" : undefined}
            />
            {errors.password && <small id="login-password-error" className="field-error">{errors.password}</small>}
          </label>

          <div className="auth-form-link">
            <Link to="/forgot-password">Forgot your password?</Link>
          </div>

          <button className="button button-primary button-large full-width" type="submit" disabled={isLoading}>
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-footer">
          New to CareTrack? <Link to="/register">Create a patient account</Link>
        </p>
      </section>
    </main>
  );
}

function AuthWelcome() {
  return (
    <section className="auth-welcome" aria-label="CareTrack introduction">
      <div className="app-brand auth-brand">
        <span className="app-brand-mark" aria-hidden="true">+</span>
        <span><strong>CareTrack</strong><small>Health companion</small></span>
      </div>
      <div>
        <p className="eyebrow eyebrow-light">Simple, private health tracking</p>
        <h2>Your care routine, organized in one place.</h2>
        <p>Stay current with medications, daily doses, personal measurements, and the information your care team needs.</p>
      </div>
      <div className="auth-feature-list">
        <span><b aria-hidden="true">✓</b> Secure account access</span>
        <span><b aria-hidden="true">✓</b> Medication reminders and history</span>
        <span><b aria-hidden="true">✓</b> Personal health measurements</span>
      </div>
    </section>
  );
}
