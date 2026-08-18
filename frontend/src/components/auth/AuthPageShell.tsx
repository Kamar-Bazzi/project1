import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface AuthPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export default function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
}: AuthPageShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-welcome" aria-label="CareTrack security">
        <Link className="app-brand auth-brand" to="/login">
          <span className="app-brand-mark" aria-hidden="true">+</span>
          <span><strong>CareTrack</strong><small>Health companion</small></span>
        </Link>
        <div>
          <p className="eyebrow eyebrow-light">Private by design</p>
          <h2>Your account security is part of your care.</h2>
          <p>Secure recovery, verified email, and session controls help keep personal health information in the right hands.</p>
        </div>
        <div className="auth-feature-list">
          <span><b aria-hidden="true">✓</b> Short-lived access tokens</span>
          <span><b aria-hidden="true">✓</b> Secure password recovery</span>
          <span><b aria-hidden="true">✓</b> Revocable device sessions</span>
        </div>
      </section>

      <section className="auth-card" aria-labelledby="auth-flow-title">
        <div className="auth-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="auth-flow-title">{title}</h1>
          <span>{description}</span>
        </div>
        {children}
      </section>
    </main>
  );
}
