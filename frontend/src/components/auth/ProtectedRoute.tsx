import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Link,
  NavLink,
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

  const endLocalSession = useCallback(() => {
    clearAccessToken();
    setAuthState({ status: "unauthenticated" });
    navigate("/login", { replace: true });
  }, [navigate]);

  const logout = useCallback(() => {
    void authService.logout().catch(() => undefined);
    endLocalSession();
  }, [endLocalSession]);

  const refreshUser = useCallback(async (): Promise<void> => {
    const user = await authService.me();
    setAuthState({ status: "authenticated", user });
  }, []);

  useEffect(() => {
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, endLocalSession);

    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, endLocalSession);
    };
  }, [endLocalSession]);

  useEffect(() => {
    let isCancelled = false;

    async function validateSession(): Promise<void> {
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
      value={{ user: authState.user, logout, refreshUser }}
    >
      <div className="protected-layout">
        <SessionHeader user={authState.user} onLogout={logout} />

        <Outlet />
      </div>
    </AuthContext.Provider>
  );
}

interface SessionHeaderProps {
  user: AuthenticatedUser;
  onLogout: () => void;
}

function SessionHeader({ user, onLogout }: SessionHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const homePath = getRoleHomePath(user.role);
  const patientLinks = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/medications", label: "Medications" },
    { to: "/appointments", label: "Appointments" },
    { to: "/history", label: "History" },
    { to: "/reports", label: "Reports" },
    { to: "/emergency", label: "I feel unwell" },
  ];
  const patientMoreLinks = [
    { to: "/measurements", label: "Measurements" },
    { to: "/health", label: "Health & alerts" },
    { to: "/goals", label: "Health goals" },
    { to: "/wearables", label: "Wearables" },
    { to: "/profile", label: "Profile" },
    { to: "/notifications", label: "Notifications" },
    { to: "/security", label: "Security" },
  ];
  const links = user.role === "PATIENT"
    ? patientLinks
    : [
        { to: homePath, label: "Dashboard" },
        { to: "/notifications", label: "Notifications" },
        { to: "/security", label: "Security" },
      ];

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-brand" to={homePath}>
          <span className="app-brand-mark" aria-hidden="true">
            +
          </span>
          <span>
            <strong>CareTrack</strong>
            <small>Health companion</small>
          </span>
        </Link>

        <button
          type="button"
          className="navigation-toggle"
          aria-expanded={isOpen}
          aria-controls="primary-navigation"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span aria-hidden="true">☰</span>
          <span className="sr-only">Toggle navigation</span>
        </button>

        <div
          id="primary-navigation"
          className={`app-navigation-wrap${isOpen ? " is-open" : ""}`}
        >
          <nav className="app-navigation" aria-label="Main navigation">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `app-navigation-link${isActive ? " is-active" : ""}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            {user.role === "PATIENT" && (
              <details className="navigation-more">
                <summary className="app-navigation-link">More</summary>
                <div className="navigation-more-menu">
                  {patientMoreLinks.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      onClick={() => setIsOpen(false)}
                      className={({ isActive }) =>
                        `app-navigation-link${isActive ? " is-active" : ""}`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </details>
            )}
          </nav>

          <div className="auth-session-identity">
            <span className="user-avatar" aria-hidden="true">
              {user.name.trim().charAt(0).toUpperCase() || "U"}
            </span>
            <span className="user-copy">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </div>

          <button
            type="button"
            className="button button-ghost button-small"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
