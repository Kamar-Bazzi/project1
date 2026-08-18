import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthPageShell from "../../components/auth/AuthPageShell";
import { getApiErrorMessage } from "../../services/api-error";
import { authService } from "../../services/auth.service";

type VerificationState =
  | { status: "loading" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const confirmationRequests = new Map<string, Promise<string>>();

function confirmEmailOnce(token: string): Promise<string> {
  const pending = confirmationRequests.get(token);

  if (pending) return pending;

  const request = authService.confirmEmail(token).finally(() => {
    confirmationRequests.delete(token);
  });
  confirmationRequests.set(token, request);
  return request;
}

export default function VerifyEmailPage() {
  const [token] = useState(readOneTimeToken);
  const [state, setState] = useState<VerificationState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    window.history.replaceState(
      window.history.state,
      document.title,
      window.location.pathname,
    );

    async function confirm(): Promise<void> {
      if (!token) {
        setState({
          status: "error",
          message: "This verification link is incomplete.",
        });
        return;
      }

      try {
        const message = await confirmEmailOnce(token);
        if (!cancelled) {
          setState({
            status: "success",
            message: message || "Your email address is verified.",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: getApiErrorMessage(
              error,
              "This verification link is invalid or has expired.",
            ),
          });
        }
      }
    }

    void confirm();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthPageShell
      eyebrow="Email verification"
      title={
        state.status === "loading"
          ? "Verifying your email"
          : state.status === "success"
            ? "Email verified"
            : "Verification failed"
      }
      description="Verified email helps us protect recovery and security notifications."
    >
      {state.status === "loading" ? (
        <div className="auth-result" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Please wait while we securely validate your link.</p>
        </div>
      ) : (
        <div
          className="auth-result"
          role={state.status === "error" ? "alert" : "status"}
        >
          <span className="state-icon" aria-hidden="true">
            {state.status === "success" ? "✓" : "!"}
          </span>
          <p>{state.message}</p>
          <Link className="button button-primary full-width" to="/login">
            Continue to sign in
          </Link>
        </div>
      )}
    </AuthPageShell>
  );
}

function readOneTimeToken(): string {
  const fragment = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  return (
    new URLSearchParams(fragment).get("token") ??
    new URLSearchParams(window.location.search).get("token") ??
    ""
  );
}
