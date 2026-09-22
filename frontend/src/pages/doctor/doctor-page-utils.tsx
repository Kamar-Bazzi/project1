/* eslint-disable react-refresh/only-export-components */
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function enumLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function patientAge(dateOfBirth: string | null): string {
  if (!dateOfBirth) return "Age unavailable";
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return "Age unavailable";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return `${age} years old`;
}

export function DoctorStateCard({
  title,
  description,
  busy = false,
  onRetry,
}: {
  title: string;
  description: string;
  busy?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div
      className="card state-card"
      aria-busy={busy}
      aria-live={busy ? "polite" : undefined}
      role={busy ? undefined : "status"}
    >
      {busy ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        <span className="state-icon" aria-hidden="true">
          i
        </span>
      )}
      <h1>{title}</h1>
      <p>{description}</p>
      {onRetry && (
        <button type="button" className="button button-primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function PatientLink({
  patientId,
  children = "Open patient",
}: {
  patientId: string;
  children?: ReactNode;
}) {
  return (
    <Link
      className="button button-secondary button-small"
      to={`/doctor/patients/${patientId}`}
    >
      {children}
    </Link>
  );
}
