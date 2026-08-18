import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../services/api-error";
import { getRoleHomePath } from "../../services/auth-routing";
import { setAccessToken } from "../../services/auth-storage";
import { authService } from "../../services/auth.service";
import { getBrowserTimeZone } from "../../services/browser-time-zone";

interface RegisterErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  function validateForm(): RegisterErrors {
    const nextErrors: RegisterErrors = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) nextErrors.name = "Enter your full name.";
    else if (trimmedName.length > 100)
      nextErrors.name = "Name must contain at most 100 characters.";

    if (!trimmedEmail) nextErrors.email = "Email is required.";
    else if (trimmedEmail.length > 255)
      nextErrors.email = "Email must contain at most 255 characters.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
      nextErrors.email = "Enter a valid email address.";

    if (!password) nextErrors.password = "Password is required.";
    else if (password.length < 8)
      nextErrors.password = "Password must contain at least 8 characters.";
    else if (password.length > 72)
      nextErrors.password = "Password must contain at most 72 characters.";
    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(password)) {
      nextErrors.password =
        "Use uppercase, lowercase, and at least one number.";
    }

    if (!confirmPassword) nextErrors.confirmPassword = "Confirm your password.";
    else if (confirmPassword !== password)
      nextErrors.confirmPassword = "Passwords do not match.";

    return nextErrors;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const nextErrors = validateForm();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const authentication = await authService.register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        timeZone: getBrowserTimeZone() ?? undefined,
      });
      if (
        authentication.requiresEmailVerification ||
        !authentication.accessToken
      ) {
        setVerificationSent(true);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      setAccessToken(authentication.accessToken);
      navigate(getRoleHomePath(authentication.user.role), { replace: true });
    } catch (error) {
      setErrors({
        form: getApiErrorMessage(
          error,
          "Registration failed. Please try again.",
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page auth-page-register">
      <section className="auth-welcome" aria-label="CareTrack introduction">
        <div className="app-brand auth-brand">
          <span className="app-brand-mark" aria-hidden="true">
            +
          </span>
          <span>
            <strong>CareTrack</strong>
            <small>Health companion</small>
          </span>
        </div>
        <div>
          <p className="eyebrow eyebrow-light">Start your health record</p>
          <h2>Small daily updates build a clearer care picture.</h2>
          <p>
            Create your patient account to keep medication schedules and health
            readings together, wherever you are.
          </p>
        </div>
        <div className="auth-privacy-note">
          <strong>Your information stays personal.</strong>
          <span>
            Account routes are protected and your session is verified with the
            backend.
          </span>
        </div>
      </section>

      <section className="auth-card" aria-labelledby="register-title">
        <div className="auth-heading">
          <p className="eyebrow">Patient registration</p>
          <h1 id="register-title">Create your account</h1>
          <span>It only takes a minute to get started.</span>
        </div>

        {errors.form && (
          <div className="alert alert-error" role="alert">
            {errors.form}
          </div>
        )}

        {verificationSent ? (
          <div className="auth-result" role="status">
            <span className="state-icon" aria-hidden="true">
              ✓
            </span>
            <h2>Check your email</h2>
            <p>
              We sent a one-time verification link to{" "}
              {email.trim().toLowerCase()}.
            </p>
            <Link className="button button-primary full-width" to="/login">
              Continue to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-stack" noValidate>
            <label className="field">
              <span>Full name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isLoading}
                placeholder="Enter your full name"
                autoComplete="name"
                maxLength={100}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && (
                <small className="field-error">{errors.name}</small>
              )}
            </label>

            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isLoading}
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={255}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && (
                <small className="field-error">{errors.email}</small>
              )}
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isLoading}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                maxLength={72}
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password ? (
                <small className="field-error">{errors.password}</small>
              ) : (
                <small>Use uppercase, lowercase, and a number.</small>
              )}
            </label>

            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isLoading}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                maxLength={72}
                aria-invalid={Boolean(errors.confirmPassword)}
              />
              {errors.confirmPassword && (
                <small className="field-error">{errors.confirmPassword}</small>
              )}
            </label>

            <button
              className="button button-primary button-large full-width"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Creating account…" : "Create patient account"}
            </button>
          </form>
        )}

        {!verificationSent && (
          <p className="auth-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        )}
      </section>
    </main>
  );
}
