import {
  useCallback,
  useEffect,
  useRef,
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
import { usePreferences } from "../../preferences";
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
  const { t } = usePreferences();
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
            t("session.errorFallback"),
          ),
        });
      }
    }

    void validateSession();

    return () => {
      isCancelled = true;
    };
  }, [t, validationAttempt]);

  if (authState.status === "loading") {
    return (
      <main className="auth-state-page" aria-busy="true" aria-live="polite">
        <div className="auth-state-card">
          <h1>{t("session.checkingTitle")}</h1>
          <p>{t("session.checkingDescription")}</p>
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
          <h1>{t("session.errorTitle")}</h1>
          <p>{authState.message}</p>

          <div className="auth-state-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() =>
                setValidationAttempt((attempt) => attempt + 1)
              }
            >
              {t("session.tryAgain")}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={logout}
            >
              {t("session.returnToLogin")}
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
  const { locale, setLocale, theme, toggleTheme, t } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const moreNavigationRef = useRef<HTMLDetailsElement>(null);
  const homePath = getRoleHomePath(user.role);
  const closeNavigation = useCallback(() => {
    setIsOpen(false);
    if (moreNavigationRef.current) moreNavigationRef.current.open = false;
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent): void {
      if (
        event.key === "Escape" &&
        (isOpen || Boolean(moreNavigationRef.current?.open))
      ) {
        closeNavigation();
        navigationToggleRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closeNavigation, isOpen]);

  const patientLinks = [
    { to: "/dashboard", label: t("navigation.dashboard") },
    { to: "/medications", label: t("navigation.medications") },
    { to: "/appointments", label: t("navigation.appointments") },
    { to: "/history", label: t("navigation.history") },
    { to: "/reports", label: t("navigation.reports") },
    { to: "/emergency", label: t("navigation.emergency") },
  ];
  const patientMoreLinks = [
    { to: "/measurements", label: t("navigation.measurements") },
    { to: "/health", label: t("navigation.health") },
    { to: "/goals", label: t("navigation.goals") },
    { to: "/wearables", label: t("navigation.wearables") },
    { to: "/check-ins", label: t("navigation.checkIns") },
    { to: "/symptoms", label: t("navigation.symptoms") },
    { to: "/documents", label: t("navigation.documents") },
    { to: "/profile", label: t("navigation.profile") },
    { to: "/notifications", label: t("navigation.notifications") },
    { to: "/security", label: t("navigation.security") },
    { to: "/privacy", label: t("navigation.privacy") },
  ];
  const links = user.role === "PATIENT"
    ? patientLinks
    : [
        { to: homePath, label: t("navigation.dashboard") },
        { to: "/notifications", label: t("navigation.notifications") },
        { to: "/security", label: t("navigation.security") },
      ];

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-brand" to={homePath}>
          <span className="app-brand-mark" aria-hidden="true">
            +
          </span>
          <span>
            <strong>{t("app.name")}</strong>
            <small>{t("app.tagline")}</small>
          </span>
        </Link>

        <button
          ref={navigationToggleRef}
          type="button"
          className="navigation-toggle"
          aria-expanded={isOpen}
          aria-controls="primary-navigation"
          aria-label={t("navigation.toggle")}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span aria-hidden="true">☰</span>
        </button>

        <div
          id="primary-navigation"
          className={`app-navigation-wrap${isOpen ? " is-open" : ""}`}
        >
          <nav className="app-navigation" aria-label={t("navigation.main")}>
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={closeNavigation}
                className={({ isActive }) =>
                  `app-navigation-link${isActive ? " is-active" : ""}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            {user.role === "PATIENT" && (
              <details ref={moreNavigationRef} className="navigation-more">
                <summary className="app-navigation-link">
                  {t("navigation.more")}
                </summary>
                <div className="navigation-more-menu">
                  {patientMoreLinks.map((link) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      onClick={closeNavigation}
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

          <div className="preference-toolbar" aria-label="Display preferences">
            <label>
              <span className="sr-only">{t("preferences.language")}</span>
              <select
                value={locale}
                onChange={(event) =>
                  setLocale(event.target.value === "ar" ? "ar" : "en")
                }
              >
                <option value="en">{t("preferences.english")}</option>
                <option value="ar">{t("preferences.arabic")}</option>
              </select>
            </label>
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={toggleTheme}
              aria-pressed={theme === "dark"}
            >
              {theme === "dark" ? t("preferences.light") : t("preferences.dark")}
            </button>
          </div>

          <button
            type="button"
            className="button button-ghost button-small"
            onClick={onLogout}
          >
            {t("navigation.logout")}
          </button>
        </div>
      </div>
    </header>
  );
}
