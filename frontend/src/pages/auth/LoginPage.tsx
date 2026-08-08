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
  const [password, setPassword] =
    useState("");

  const [errors, setErrors] =
    useState<LoginErrors>({});

  const [isLoading, setIsLoading] =
    useState(false);

  function validateForm(): LoginErrors {
    const validationErrors: LoginErrors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      validationErrors.email =
        "Email is required.";
    } else if (trimmedEmail.length > 255) {
      validationErrors.email =
        "Email must contain at most 255 characters.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
    ) {
      validationErrors.email =
        "Enter a valid email address.";
    }

    if (!password) {
      validationErrors.password =
        "Password is required.";
    } else if (password.length < 8) {
      validationErrors.password =
        "Password must contain at least 8 characters.";
    } else if (password.length > 72) {
      validationErrors.password =
        "Password must contain at most 72 characters.";
    }

    return validationErrors;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const validationErrors = validateForm();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
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

      navigate(getRoleHomePath(authentication.user.role), {
        replace: true,
      });
    } catch (error) {
      setErrors({
        form: getApiErrorMessage(
          error,
          "Login failed. Please try again.",
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <p style={styles.systemName}>
            Medical Tracking System
          </p>

          <h1 style={styles.title}>
            Welcome back
          </h1>

          <p style={styles.subtitle}>
            Please sign in to your account.
          </p>
        </div>

        {errors.form && (
          <div
            style={styles.errorBanner}
            role="alert"
          >
            {errors.form}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={styles.form}
          noValidate
        >
          <div style={styles.inputGroup}>
            <label
              style={styles.label}
              htmlFor="login-email"
            >
              Email address
            </label>

            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              style={styles.input}
              placeholder="Enter your email"
              disabled={isLoading}
              autoComplete="email"
              maxLength={255}
            />

            {errors.email && (
              <span style={styles.fieldError}>
                {errors.email}
              </span>
            )}
          </div>

          <div style={styles.inputGroup}>
            <label
              style={styles.label}
              htmlFor="login-password"
            >
              Password
            </label>

            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              style={styles.input}
              placeholder="Enter your password"
              disabled={isLoading}
              autoComplete="current-password"
              maxLength={72}
            />

            {errors.password && (
              <span style={styles.fieldError}>
                {errors.password}
              </span>
            )}
          </div>

          <button
            type="submit"
            style={styles.button}
            disabled={isLoading}
          >
            {isLoading
              ? "Signing in..."
              : "Login"}
          </button>

          <p style={styles.footer}>
            Do not have an account?{" "}
            <Link
              to="/register"
              style={styles.link}
            >
              Create account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#0f172a",
    padding: "20px",
  },

  card: {
    backgroundColor: "#ffffff",
    padding: "40px",
    borderRadius: "12px",
    boxShadow:
      "0 10px 25px rgba(0, 0, 0, 0.2)",
    width: "100%",
    maxWidth: "420px",
    boxSizing: "border-box" as const,
  },

  header: {
    textAlign: "center" as const,
    marginBottom: "24px",
  },

  systemName: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#0284c7",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    margin: "0 0 6px",
  },

  title: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#0f172a",
    margin: "0 0 6px",
  },

  subtitle: {
    fontSize: "14px",
    color: "#64748b",
    margin: 0,
  },

  form: {
    display: "flex",
    flexDirection: "column" as const,
  },

  inputGroup: {
    marginBottom: "16px",
  },

  label: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: "6px",
    display: "block",
  },

  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box" as const,
    backgroundColor: "#ffffff",
    color: "#0f172a",
  },

  button: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#38bdf8",
    color: "#0f172a",
    fontWeight: "bold",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    marginTop: "10px",
    fontSize: "16px",
  },

  errorBanner: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
    padding: "10px",
    borderRadius: "6px",
    fontSize: "13px",
    marginBottom: "16px",
    textAlign: "center" as const,
  },

  fieldError: {
    color: "#dc2626",
    fontSize: "12px",
    marginTop: "4px",
    display: "block",
  },

  footer: {
    textAlign: "center" as const,
    marginTop: "20px",
    marginBottom: 0,
    fontSize: "14px",
    color: "#64748b",
  },

  link: {
    color: "#0284c7",
    textDecoration: "none",
    fontWeight: "600",
  },
};
