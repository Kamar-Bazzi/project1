import {
  FormEvent,
  useState,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

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
  const [password, setPassword] =
    useState("");
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

    if (password.length < 8) {
      validationErrors.password =
        "Password must contain at least 8 characters.";
    }

    if (confirmPassword !== password) {
      validationErrors.confirmPassword =
        "Passwords do not match.";
    }

    return validationErrors;
  }

  async function handleRegister(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const validationErrors = validateForm();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      // Temporary delay until the real backend is connected.
      await new Promise((resolve) =>
        setTimeout(resolve, 800),
      );

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
    <main className="auth-page">
      <form
        className="auth-card"
        onSubmit={handleRegister}
        noValidate
      >
        <div className="auth-heading">
          <p>Medical Tracking System</p>
          <h1>Create account</h1>
          <span>Create your patient account.</span>
        </div>

        {errors.form && (
          <div className="error-banner">
            {errors.form}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="register-name">
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
          />

          {errors.name && (
            <span className="field-error">
              {errors.name}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="register-email">
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
          />

          {errors.email && (
            <span className="field-error">
              {errors.email}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="register-password">
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
          />

          {errors.password && (
            <span className="field-error">
              {errors.password}
            </span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="confirm-password">
            Confirm password
          </label>

          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(event.target.value)
            }
            disabled={isLoading}
          />

          {errors.confirmPassword && (
            <span className="field-error">
              {errors.confirmPassword}
            </span>
          )}
        </div>

        <button
          type="submit"
          className="primary-button full-width"
          disabled={isLoading}
        >
          {isLoading
            ? "Creating account..."
            : "Create account"}
        </button>

        <p className="auth-footer">
          Already registered?{" "}
          <Link to="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}