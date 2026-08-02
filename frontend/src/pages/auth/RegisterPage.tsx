import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [errors, setErrors] =
    useState<RegisterErrors>({});

  const [isLoading, setIsLoading] =
    useState(false);

  function validateForm(): RegisterErrors {
    const validationErrors: RegisterErrors = {};

    if (name.trim().length < 2) {
      validationErrors.name =
        "Enter your full name.";
    }

    if (!email.trim()) {
      validationErrors.email =
        "Email is required.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
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
    }

    if (!confirmPassword) {
      validationErrors.confirmPassword =
        "Confirm your password.";
    } else if (confirmPassword !== password) {
      validationErrors.confirmPassword =
        "Passwords do not match.";
    }

    return validationErrors;
  }

  async function handleRegister(
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
      // Temporary simulation until backend connection.
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 800);
      });

      navigate("/dashboard");
    } catch {
      setErrors({
        form: "Registration failed. Please try again.",
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
            Create account
          </h1>

          <p style={styles.subtitle}>
            Create your patient account.
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
          onSubmit={handleRegister}
          style={styles.form}
          noValidate
        >
          <div style={styles.inputGroup}>
            <label
              style={styles.label}
              htmlFor="register-name"
            >
              Full name
            </label>

            <input
              id="register-name"
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              disabled={isLoading}
              style={styles.input}
              placeholder="Enter your full name"
              autoComplete="name"
            />

            {errors.name && (
              <span style={styles.fieldError}>
                {errors.name}
              </span>
            )}
          </div>

          <div style={styles.inputGroup}>
            <label
              style={styles.label}
              htmlFor="register-email"
            >
              Email
            </label>

            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              disabled={isLoading}
              style={styles.input}
              placeholder="Enter your email"
              autoComplete="email"
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
              htmlFor="register-password"
            >
              Password
            </label>

            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              disabled={isLoading}
              style={styles.input}
              placeholder="Create a password"
              autoComplete="new-password"
            />

            {errors.password && (
              <span style={styles.fieldError}>
                {errors.password}
              </span>
            )}
          </div>

          <div style={styles.inputGroup}>
            <label
              style={styles.label}
              htmlFor="confirm-password"
            >
              Confirm password
            </label>

            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value,
                )
              }
              disabled={isLoading}
              style={styles.input}
              placeholder="Confirm your password"
              autoComplete="new-password"
            />

            {errors.confirmPassword && (
              <span style={styles.fieldError}>
                {errors.confirmPassword}
              </span>
            )}
          </div>

          <button
            type="submit"
            style={styles.button}
            disabled={isLoading}
          >
            {isLoading
              ? "Creating account..."
              : "Create account"}
          </button>

          <p style={styles.footer}>
            Already registered?{" "}
            <Link
              to="/login"
              style={styles.link}
            >
              Sign in
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