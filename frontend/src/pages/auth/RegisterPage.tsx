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

const registerCopy: Record<string, string> = {
  "app.name": "CareTrack",
  "app.tagline": "Health companion",
  "auth.welcome.label": "CareTrack welcome",
  "auth.login.error.emailRequired": "Email is required.",
  "auth.login.error.emailLength": "Email must be 255 characters or fewer.",
  "auth.login.error.emailInvalid": "Enter a valid email address.",
  "auth.login.error.passwordRequired": "Password is required.",
  "auth.login.error.passwordLengthMin": "Password must be at least 8 characters.",
  "auth.login.error.passwordLengthMax": "Password must be 72 characters or fewer.",
  "auth.login.email": "Email",
  "auth.login.emailPlaceholder": "you@example.com",
  "auth.login.password": "Password",
  "auth.register.error.nameRequired": "Name must be at least 2 characters.",
  "auth.register.error.nameLength": "Name must be 100 characters or fewer.",
  "auth.register.error.passwordStrength":
    "Password must include uppercase, lowercase, and a number.",
  "auth.register.error.confirmRequired": "Confirm your password.",
  "auth.register.error.confirmMismatch": "Passwords do not match.",
  "auth.register.error.request": "We could not create your account.",
  "auth.register.welcomeEyebrow": "Start with CareTrack",
  "auth.register.welcomeTitle": "Build a secure health workspace.",
  "auth.register.welcomeDescription":
    "Create your account to manage medications, appointments, measurements, and health alerts.",
  "auth.register.privacyTitle": "Privacy first",
  "auth.register.privacyDescription":
    "Your health information stays protected behind your account.",
  "auth.register.eyebrow": "Create account",
  "auth.register.title": "Join CareTrack",
  "auth.register.description": "Enter your details to start tracking your care.",
  "auth.register.sentTitle": "Check your email",
  "auth.register.sentDescription":
    "We sent a verification link to {email}. Verify your email before signing in.",
  "auth.register.continue": "Continue to sign in",
  "auth.register.name": "Name",
  "auth.register.namePlaceholder": "Your full name",
  "auth.register.passwordPlaceholder": "Create a password",
  "auth.register.passwordHelp":
    "Use at least 8 characters with uppercase, lowercase, and a number.",
  "auth.register.confirmPassword": "Confirm password",
  "auth.register.confirmPlaceholder": "Repeat your password",
  "auth.register.submitting": "Creating account…",
  "auth.register.submit": "Create account",
  "auth.register.existingUser": "Already have an account?",
  "auth.register.loginLink": "Sign in",
};

function t(key: string, values?: Record<string, string>): string {
  let copy = registerCopy[key] ?? key;
  for (const [name, value] of Object.entries(values ?? {})) {
    copy = copy.replace(`{${name}}`, value);
  }
  return copy;
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

    if (trimmedName.length < 2) nextErrors.name = t("auth.register.error.nameRequired");
    else if (trimmedName.length > 100)
      nextErrors.name = t("auth.register.error.nameLength");

    if (!trimmedEmail) nextErrors.email = t("auth.login.error.emailRequired");
    else if (trimmedEmail.length > 255)
      nextErrors.email = t("auth.login.error.emailLength");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
      nextErrors.email = t("auth.login.error.emailInvalid");

    if (!password) nextErrors.password = t("auth.login.error.passwordRequired");
    else if (password.length < 8)
      nextErrors.password = t("auth.login.error.passwordLengthMin");
    else if (password.length > 72)
      nextErrors.password = t("auth.login.error.passwordLengthMax");
    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(password)) {
      nextErrors.password = t("auth.register.error.passwordStrength");
    }

    if (!confirmPassword) nextErrors.confirmPassword = t("auth.register.error.confirmRequired");
    else if (confirmPassword !== password)
      nextErrors.confirmPassword = t("auth.register.error.confirmMismatch");

    return nextErrors;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const nextErrors = validateForm();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstInvalidField = nextErrors.name
        ? "register-name"
        : nextErrors.email
          ? "register-email"
          : nextErrors.password
            ? "register-password"
            : "register-confirm-password";
      document.getElementById(firstInvalidField)?.focus();
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
          t("auth.register.error.request"),
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }

  const fieldErrorAnnouncement = [
    errors.name,
    errors.email,
    errors.password,
    errors.confirmPassword,
  ]
    .filter((message): message is string => Boolean(message))
    .join(" ");

  return (
    <main className="auth-page auth-page-register">
      <section className="auth-welcome" aria-label={t("auth.welcome.label")}>
        <div className="app-brand auth-brand">
          <span className="app-brand-mark" aria-hidden="true">
            +
          </span>
          <span>
            <strong>{t("app.name")}</strong>
            <small>{t("app.tagline")}</small>
          </span>
        </div>
        <div>
          <p className="eyebrow eyebrow-light">
            {t("auth.register.welcomeEyebrow")}
          </p>
          <h2>{t("auth.register.welcomeTitle")}</h2>
          <p>{t("auth.register.welcomeDescription")}</p>
        </div>
        <div className="auth-privacy-note">
          <strong>{t("auth.register.privacyTitle")}</strong>
          <span>{t("auth.register.privacyDescription")}</span>
        </div>
      </section>

      <section className="auth-card" aria-labelledby="register-title">
        <div className="auth-heading">
          <p className="eyebrow">{t("auth.register.eyebrow")}</p>
          <h1 id="register-title">{t("auth.register.title")}</h1>
          <span>{t("auth.register.description")}</span>
        </div>

        {errors.form && (
          <div className="alert alert-error" role="alert" aria-live="assertive">
            {errors.form}
          </div>
        )}
        {fieldErrorAnnouncement && (
          <p className="sr-only" role="alert">
            {fieldErrorAnnouncement}
          </p>
        )}

        {verificationSent ? (
          <div className="auth-result" role="status" aria-live="polite">
            <span className="state-icon" aria-hidden="true">
              ✓
            </span>
            <h2>{t("auth.register.sentTitle")}</h2>
            <p>{t("auth.register.sentDescription", { email: email.trim().toLowerCase() })}</p>
            <Link className="button button-primary full-width" to="/login">
              {t("auth.register.continue")}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-stack" noValidate>
            <div className="field">
              <label htmlFor="register-name">{t("auth.register.name")}</label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isLoading}
                placeholder={t("auth.register.namePlaceholder")}
                autoComplete="name"
                maxLength={100}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "register-name-error" : undefined}
              />
              {errors.name && (
                <small id="register-name-error" className="field-error">
                  {errors.name}
                </small>
              )}
            </div>

            <div className="field">
              <label htmlFor="register-email">{t("auth.login.email")}</label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isLoading}
                placeholder={t("auth.login.emailPlaceholder")}
                autoComplete="email"
                maxLength={255}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "register-email-error" : undefined}
              />
              {errors.email && (
                <small id="register-email-error" className="field-error">
                  {errors.email}
                </small>
              )}
            </div>

            <div className="field">
              <label htmlFor="register-password">{t("auth.login.password")}</label>
              <input
                id="register-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isLoading}
                placeholder={t("auth.register.passwordPlaceholder")}
                autoComplete="new-password"
                maxLength={72}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "register-password-error" : "register-password-help"}
              />
              {errors.password ? (
                <small id="register-password-error" className="field-error">
                  {errors.password}
                </small>
              ) : (
                <small id="register-password-help">
                  {t("auth.register.passwordHelp")}
                </small>
              )}
            </div>

            <div className="field">
              <label htmlFor="register-confirm-password">
                {t("auth.register.confirmPassword")}
              </label>
              <input
                id="register-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isLoading}
                placeholder={t("auth.register.confirmPlaceholder")}
                autoComplete="new-password"
                maxLength={72}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? "register-confirm-password-error" : undefined}
              />
              {errors.confirmPassword && (
                <small id="register-confirm-password-error" className="field-error">
                  {errors.confirmPassword}
                </small>
              )}
            </div>

            <button
              className="button button-primary button-large full-width"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? t("auth.register.submitting") : t("auth.register.submit")}
            </button>
          </form>
        )}

        {!verificationSent && (
          <p className="auth-footer">
            {t("auth.register.existingUser")} {" "}
            <Link to="/login">{t("auth.register.loginLink")}</Link>
          </p>
        )}
      </section>
    </main>
  );
}
