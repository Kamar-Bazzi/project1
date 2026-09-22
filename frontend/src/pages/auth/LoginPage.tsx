import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../services/api-error";
import { getRoleHomePath } from "../../services/auth-routing";
import { setAccessToken } from "../../services/auth-storage";
import {
  authService,
  type TwoFactorChallengeResponse,
} from "../../services/auth.service";

interface LoginErrors {
  email?: string;
  password?: string;
  code?: string;
  form?: string;
}

const loginCopy: Record<string, string> = {
  "app.name": "CareTrack",
  "app.tagline": "Health companion",
  "auth.welcome.label": "CareTrack welcome",
  "auth.welcome.eyebrow": "Personal health workspace",
  "auth.welcome.title": "Track care with confidence.",
  "auth.welcome.description":
    "Manage medications, measurements, appointments, and health alerts in one secure place.",
  "auth.welcome.feature.secure": "Protected health records",
  "auth.welcome.feature.medications": "Medication schedule tracking",
  "auth.welcome.feature.measurements": "Measurement history",
  "auth.login.error.emailRequired": "Email is required.",
  "auth.login.error.emailLength": "Email must be 255 characters or fewer.",
  "auth.login.error.emailInvalid": "Enter a valid email address.",
  "auth.login.error.passwordRequired": "Password is required.",
  "auth.login.error.passwordLengthMin": "Password must be at least 8 characters.",
  "auth.login.error.passwordLengthMax": "Password must be 72 characters or fewer.",
  "auth.login.error.request": "We could not sign you in.",
  "auth.login.error.code": "Enter the 6-digit verification code.",
  "auth.login.error.verify": "We could not verify the code.",
  "auth.login.eyebrow": "Welcome back",
  "auth.login.verifyTitle": "Verify your sign-in",
  "auth.login.title": "Sign in",
  "auth.login.verifyEmail": "Enter the code sent to {email}.",
  "auth.login.verifyApp": "Enter the code from your authenticator app.",
  "auth.login.description": "Use your CareTrack account to continue.",
  "auth.login.code": "Verification code",
  "auth.login.verifying": "Verifying…",
  "auth.login.verify": "Verify",
  "auth.login.differentAccount": "Use a different account",
  "auth.login.email": "Email",
  "auth.login.emailPlaceholder": "you@example.com",
  "auth.login.password": "Password",
  "auth.login.passwordPlaceholder": "Enter your password",
  "auth.login.forgotPassword": "Forgot password?",
  "auth.login.submitting": "Signing in…",
  "auth.login.submit": "Sign in",
  "auth.login.newUser": "New to CareTrack?",
  "auth.login.registerLink": "Create an account",
};

function t(key: string, values?: Record<string, string>): string {
  let copy = loginCopy[key] ?? key;
  for (const [name, value] of Object.entries(values ?? {})) {
    copy = copy.replace(`{${name}}`, value);
  }
  return copy;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [challenge, setChallenge] =
    useState<TwoFactorChallengeResponse | null>(null);
  const [code, setCode] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (challenge) codeInputRef.current?.focus();
  }, [challenge]);

  function validateForm(): LoginErrors {
    const nextErrors: LoginErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) nextErrors.email = t("auth.login.error.emailRequired");
    else if (trimmedEmail.length > 255) nextErrors.email = t("auth.login.error.emailLength");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) nextErrors.email = t("auth.login.error.emailInvalid");

    if (!password) nextErrors.password = t("auth.login.error.passwordRequired");
    else if (password.length < 8) nextErrors.password = t("auth.login.error.passwordLengthMin");
    else if (password.length > 72) nextErrors.password = t("auth.login.error.passwordLengthMax");

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validateForm();

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      document
        .getElementById(nextErrors.email ? "login-email" : "login-password")
        ?.focus();
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      const authentication = await authService.login({
        email: email.trim().toLowerCase(),
        password,
      });
      if ("requiresTwoFactor" in authentication) {
        setChallenge(authentication);
        setCode("");
        return;
      }
      setAccessToken(authentication.accessToken);
      navigate(getRoleHomePath(authentication.user.role), { replace: true });
    } catch (error) {
      setErrors({
        form: getApiErrorMessage(error, t("auth.login.error.request")),
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTwoFactorSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!challenge) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setErrors({ code: t("auth.login.error.code") });
      document.getElementById("login-code")?.focus();
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      const authentication = await authService.verifyTwoFactorLogin(
        challenge.challengeId,
        code.trim(),
      );
      setAccessToken(authentication.accessToken);
      navigate(getRoleHomePath(authentication.user.role), { replace: true });
    } catch (error) {
      setErrors({
        form: getApiErrorMessage(
          error,
          t("auth.login.error.verify"),
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }

  const fieldErrorAnnouncement = [
    errors.email,
    errors.password,
    errors.code,
  ]
    .filter((message): message is string => Boolean(message))
    .join(" ");

  return (
    <main className="auth-page">
      <AuthWelcome />
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-heading">
          <p className="eyebrow">{t("auth.login.eyebrow")}</p>
          <h1 id="login-title">
            {challenge ? t("auth.login.verifyTitle") : t("auth.login.title")}
          </h1>
          <span>
            {challenge
              ? challenge.method === "EMAIL_OTP"
                ? t("auth.login.verifyEmail", { email: challenge.user.email })
                : t("auth.login.verifyApp")
              : t("auth.login.description")}
          </span>
        </div>

        {errors.form && <div className="alert alert-error" role="alert" aria-live="assertive">{errors.form}</div>}
        {fieldErrorAnnouncement && (
          <p className="sr-only" role="alert">
            {fieldErrorAnnouncement}
          </p>
        )}

        {challenge ? (
          <form
            onSubmit={handleTwoFactorSubmit}
            className="form-stack"
            noValidate
          >
            <div className="field">
              <label htmlFor="login-code">{t("auth.login.code")}</label>
              <input
                ref={codeInputRef}
                id="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                disabled={isLoading}
                aria-invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? "login-code-error" : undefined}
              />
              {errors.code && (
                <small id="login-code-error" className="field-error">
                  {errors.code}
                </small>
              )}
            </div>
            <button
              className="button button-primary button-large full-width"
              type="submit"
              disabled={isLoading || code.length !== 6}
            >
              {isLoading ? t("auth.login.verifying") : t("auth.login.verify")}
            </button>
            <button
              className="button button-ghost full-width"
              type="button"
              disabled={isLoading}
              onClick={() => {
                setChallenge(null);
                setCode("");
                setErrors({});
              }}
            >
              {t("auth.login.differentAccount")}
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="form-stack" noValidate>
          <div className="field">
            <label htmlFor="login-email">{t("auth.login.email")}</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.login.emailPlaceholder")}
              disabled={isLoading}
              autoComplete="email"
              maxLength={255}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "login-email-error" : undefined}
            />
            {errors.email && <small id="login-email-error" className="field-error">{errors.email}</small>}
          </div>

          <div className="field">
            <label htmlFor="login-password">{t("auth.login.password")}</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.login.passwordPlaceholder")}
              disabled={isLoading}
              autoComplete="current-password"
              maxLength={72}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "login-password-error" : undefined}
            />
            {errors.password && <small id="login-password-error" className="field-error">{errors.password}</small>}
          </div>

          <div className="auth-form-link">
            <Link to="/forgot-password">{t("auth.login.forgotPassword")}</Link>
          </div>

          <button className="button button-primary button-large full-width" type="submit" disabled={isLoading}>
            {isLoading ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>
        </form>
        )}

        {!challenge && <p className="auth-footer">
          {t("auth.login.newUser")} {" "}
          <Link to="/register">{t("auth.login.registerLink")}</Link>
        </p>}
      </section>
    </main>
  );
}

function AuthWelcome() {
  return (
    <section className="auth-welcome" aria-label={t("auth.welcome.label")}>
      <div className="app-brand auth-brand">
        <span className="app-brand-mark" aria-hidden="true">+</span>
        <span><strong>{t("app.name")}</strong><small>{t("app.tagline")}</small></span>
      </div>
      <div>
        <p className="eyebrow eyebrow-light">{t("auth.welcome.eyebrow")}</p>
        <h2>{t("auth.welcome.title")}</h2>
        <p>{t("auth.welcome.description")}</p>
      </div>
      <div className="auth-feature-list">
        <span><b aria-hidden="true">✓</b> {t("auth.welcome.feature.secure")}</span>
        <span><b aria-hidden="true">✓</b> {t("auth.welcome.feature.medications")}</span>
        <span><b aria-hidden="true">✓</b> {t("auth.welcome.feature.measurements")}</span>
      </div>
    </section>
  );
}
