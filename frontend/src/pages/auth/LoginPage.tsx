import {
  FormEvent,
  useState,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

interface LoginErrors {
  email?: string;
  password?: string;
  form?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errors, setErrors] =
    useState<LoginErrors>({});

  const [isLoading, setIsLoading] =
    useState(false);

  function validateForm(): LoginErrors {
    const validationErrors: LoginErrors = {};

    if (!email.trim()) {
      validationErrors.email = "Email is required.";
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

    return validationErrors;
  }

  async function handleLogin(
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
        form: "Login failed. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form
        className="auth-card"
        onSubmit={handleLogin}
        noValidate
      >
        <div className="auth-heading">
          <p>Medical Tracking System</p>
          <h1>Sign in</h1>
          <span>
            Enter your account information.
          </span>
        </div>

        {errors.form && (
          <div className="error-banner">
            {errors.form}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="login-email">Email</label>

          <input
            id="login-email"
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
          <label htmlFor="login-password">
            Password
          </label>

          <input
            id="login-password"
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

        <button
          type="submit"
          className="primary-button full-width"
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>

        <p className="auth-footer">
          Do not have an account?{" "}
          <Link to="/register">Create account</Link>
        </p>
      </form>
    </main>
  );
}