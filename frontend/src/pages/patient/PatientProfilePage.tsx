import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "../../components/auth/auth-context";
import EmergencyContactsSection from "../../components/profile/EmergencyContactsSection";
import { getApiErrorMessage } from "../../services/api-error";
import { getBrowserTimeZone } from "../../services/browser-time-zone";
import { patientService } from "../../services/patient.service";
import type { PatientProfile } from "../../types/patient";

interface ProfileDraft {
  name: string;
  timeZone: string;
  dateOfBirth: string;
  phoneNumber: string;
  emergencyContact: string;
}

const emptyDraft: ProfileDraft = {
  name: "",
  timeZone: "",
  dateOfBirth: "",
  phoneNumber: "",
  emergencyContact: "",
};

const detectedBrowserTimeZone = getBrowserTimeZone();
const commonTimeZones = [
  "UTC",
  "Asia/Beirut",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function draftFromProfile(profile: PatientProfile): ProfileDraft {
  return {
    name: profile.name,
    timeZone: profile.timeZone || detectedBrowserTimeZone || "UTC",
    dateOfBirth: toDateInput(profile.dateOfBirth),
    phoneNumber: profile.phoneNumber ?? "",
    emergencyContact: profile.emergencyContact ?? "",
  };
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function todayForTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export default function PatientProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadProfile = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextProfile = await patientService.getProfile();
      setProfile(nextProfile);
      setDraft(draftFromProfile(nextProfile));
    } catch (error) {
      setLoadError(
        getApiErrorMessage(
          error,
          "We could not load your profile. Please try again.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const name = draft.name.trim();
    const timeZone = draft.timeZone.trim();

    if (name.length < 2 || name.length > 100) {
      setFormError("Your name must contain between 2 and 100 characters.");
      return;
    }

    if (!timeZone) {
      setFormError("Medication timezone is required.");
      return;
    }

    if (!isValidTimeZone(timeZone)) {
      setFormError(
        "Enter a valid IANA timezone, such as Asia/Beirut or Europe/London.",
      );
      return;
    }

    if (draft.dateOfBirth && draft.dateOfBirth > todayForTimeZone(timeZone)) {
      setFormError("Date of birth cannot be in the future.");
      return;
    }

    setIsSaving(true);
    let updatedProfile: PatientProfile;

    try {
      updatedProfile = await patientService.updateProfile({
        name,
        timeZone,
        dateOfBirth: draft.dateOfBirth || null,
        phoneNumber: draft.phoneNumber.trim() || null,
        emergencyContact: draft.emergencyContact.trim() || null,
      });
    } catch (error) {
      setFormError(
        getApiErrorMessage(
          error,
          "Your profile could not be updated. Please try again.",
        ),
      );
      setIsSaving(false);
      return;
    }

    setProfile(updatedProfile);
    setDraft(draftFromProfile(updatedProfile));
    setSuccessMessage("Your profile has been updated.");
    setIsSaving(false);

    try {
      await refreshUser();
    } catch {
      setSuccessMessage(
        "Your profile was updated. Reload the page to refresh the account header.",
      );
    }
  }

  if (isLoading) {
    return <PageLoading title="Loading your profile" />;
  }

  if (loadError || !profile) {
    return (
      <main className="page-shell">
        <section className="state-card" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <h1>Profile unavailable</h1>
          <p>{loadError ?? "Your profile could not be found."}</p>
          <button className="button button-primary" onClick={() => void loadProfile()}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  const draftTimeZone = draft.timeZone.trim();
  const storedTimeZone =
    profile.timeZone && isValidTimeZone(profile.timeZone)
      ? profile.timeZone
      : "UTC";
  const dateLimitTimeZone = isValidTimeZone(draftTimeZone)
    ? draftTimeZone
    : storedTimeZone;
  const latestBirthDate = todayForTimeZone(dateLimitTimeZone);

  return (
    <main className="page-shell page-shell-narrow">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Personal settings</p>
          <h1>Patient profile</h1>
          <p>Keep your contact and emergency information current.</p>
        </div>
      </header>

      <div className="profile-layout">
        <aside className="card profile-summary-card">
          <span className="profile-avatar" aria-hidden="true">
            {profile.name.trim().charAt(0).toUpperCase()}
          </span>
          <h2>{profile.name}</h2>
          <p>{profile.email}</p>
          <span className="badge badge-info">Patient account</span>

          <dl className="detail-list profile-detail-list">
            <div>
              <dt>Member since</dt>
              <dd>{new Date(profile.createdAt).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt>Account email</dt>
              <dd>{user.email}</dd>
            </div>
            {profile.timeZone && (
              <div>
                <dt>Medication timezone</dt>
                <dd>{profile.timeZone}</dd>
              </div>
            )}
          </dl>
        </aside>

        <section className="card form-card">
          <div className="section-heading">
            <div>
              <h2>Personal information</h2>
              <p>Your email is managed by your secure account.</p>
            </div>
          </div>

          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          {successMessage && (
            <div className="alert alert-success" role="status">{successMessage}</div>
          )}

          <form onSubmit={handleSubmit} className="form-stack" noValidate>
            <div className="form-grid">
              <label className="field field-wide">
                <span>Full name</span>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  disabled={isSaving}
                  maxLength={100}
                  autoComplete="name"
                  required
                />
              </label>

              <label className="field">
                <span>Date of birth</span>
                <input
                  type="date"
                  value={draft.dateOfBirth}
                  min="1900-01-01"
                  max={latestBirthDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      dateOfBirth: event.target.value,
                    }))
                  }
                  disabled={isSaving}
                />
              </label>

              <label className="field">
                <span>Phone number</span>
                <input
                  type="tel"
                  value={draft.phoneNumber}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      phoneNumber: event.target.value,
                    }))
                  }
                  disabled={isSaving}
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="e.g. +961 70 123 456"
                />
              </label>

              <label className="field field-wide">
                <span>Medication schedule timezone</span>
                <input
                  value={draft.timeZone}
                  list="patient-time-zone-options"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      timeZone: event.target.value,
                    }))
                  }
                  disabled={isSaving}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="e.g. Asia/Beirut"
                  required
                />
                <datalist id="patient-time-zone-options">
                  {commonTimeZones.map((timeZone) => (
                    <option key={timeZone} value={timeZone} />
                  ))}
                </datalist>
                <small>
                  Use an IANA name such as Asia/Beirut. This controls which
                  calendar day contains your doses and changes only when you
                  save it; travel does not update it automatically.
                </small>
              </label>

              <label className="field field-wide">
                <span>Legacy emergency contact note</span>
                <input
                  value={draft.emergencyContact}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      emergencyContact: event.target.value,
                    }))
                  }
                  disabled={isSaving}
                  maxLength={120}
                  placeholder="Name and phone number"
                />
                <small>
                  This existing free-text field is retained for compatibility. Use
                  the structured contacts below for optional alert notifications.
                </small>
              </label>
            </div>

            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save changes"}
              </button>
              <button
                className="button button-secondary"
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setDraft(draftFromProfile(profile));
                  setFormError(null);
                  setSuccessMessage(null);
                }}
              >
                Reset
              </button>
            </div>
          </form>
        </section>
      </div>

      <EmergencyContactsSection />
    </main>
  );
}

function PageLoading({ title }: { title: string }) {
  return (
    <main className="page-shell">
      <section className="state-card" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <h1>{title}</h1>
        <p>Please wait a moment.</p>
      </section>
    </main>
  );
}
