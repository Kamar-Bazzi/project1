import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  getApiErrorMessage,
  isUnauthorizedApiError,
} from "../../services/api-error";
import { getRoleHomePath } from "../../services/auth-routing";
import {
  AUTH_UNAUTHORIZED_EVENT,
  clearAccessToken,
  getAccessToken,
} from "../../services/auth-storage";
import {
  authService,
  type AuthenticatedUser,
  type UserRole,
} from "../../services/auth.service";
import { AuthContext } from "./auth-context";

interface ProtectedRouteProps {
  allowedRoles: readonly UserRole[];
}

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AuthenticatedUser }
  | { status: "error"; message: string };

export default function ProtectedRoute({
  allowedRoles,
}: ProtectedRouteProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [authState, setAuthState] = useState<AuthState>({
    status: "loading",
  });

  const logout = useCallback(() => {
    clearAccessToken();
    setAuthState({ status: "unauthenticated" });
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, logout);

    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, logout);
    };
  }, [logout]);

  useEffect(() => {
    let isCancelled = false;

    async function validateSession(): Promise<void> {
      if (!getAccessToken()) {
        setAuthState({ status: "unauthenticated" });
        return;
      }

      setAuthState({ status: "loading" });

      try {
        const user = await authService.me();

        if (!isCancelled) {
          setAuthState({
            status: "authenticated",
            user,
          });
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (isUnauthorizedApiError(error)) {
          clearAccessToken();
          setAuthState({ status: "unauthenticated" });
          return;
        }

        setAuthState({
          status: "error",
          message: getApiErrorMessage(
            error,
            "We could not verify your session. Please try again.",
          ),
        });
      }
    }

    void validateSession();

    return () => {
      isCancelled = true;
    };
  }, [validationAttempt]);

  if (authState.status === "loading") {
    return (
      <main className="auth-state-page" aria-live="polite">
        <div className="auth-state-card">
          <h1>Checking your session</h1>
          <p>Please wait while we securely load your account.</p>
        </div>
      </main>
    );
  }

  if (authState.status === "unauthenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (authState.status === "error") {
    return (
      <main className="auth-state-page" role="alert">
        <div className="auth-state-card">
          <h1>Session check failed</h1>
          <p>{authState.message}</p>

          <div className="auth-state-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                setValidationAttempt((attempt) => attempt + 1)
              }
            >
              Try again
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={logout}
            >
              Return to login
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!allowedRoles.includes(authState.user.role)) {
    return (
      <Navigate
        to={getRoleHomePath(authState.user.role)}
        replace
      />
    );
  }

  return (
    <AuthContext.Provider
      value={{ user: authState.user, logout }}
    >
      <div className="protected-layout">
        <header className="auth-session-bar">
          <div className="auth-session-identity">
            <strong>{authState.user.name}</strong>
            <span>
              {authState.user.email} · {authState.user.role}
            </span>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={logout}
          >
            Log out
          </button>
        </header>

        <Outlet />
      </div>
    </AuthContext.Provider>
  );
}
