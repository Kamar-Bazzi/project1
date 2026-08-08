import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { emergencyContactService } from "../../services/emergency-contact.service";
import type {
  EmergencyContact,
  EmergencyContactInput,
} from "../../types/health";

interface ContactDraft {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  active: boolean;
}

const emptyContact: ContactDraft = {
  name: "",
  relationship: "",
  phone: "",
  email: "",
  active: true,
};

function draftFromContact(contact: EmergencyContact): ContactDraft {
  return {
    name: contact.name,
    relationship: contact.relationship,
    phone: contact.phone,
    email: contact.email ?? "",
    active: contact.active,
  };
}

export default function EmergencyContactsSection() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [draft, setDraft] = useState<ContactDraft>(emptyContact);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mutationId, setMutationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadContacts = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setContacts(await emergencyContactService.list());
    } catch (loadError) {
      setLoadError(
        getApiErrorMessage(loadError, "We could not load your emergency contacts."),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  function resetForm(): void {
    setDraft(emptyContact);
    setEditingId(null);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const input: EmergencyContactInput = {
      name: draft.name.trim(),
      relationship: draft.relationship.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim() || null,
      active: draft.active,
    };

    if (input.name.length < 1 || input.relationship.length < 1 || input.phone.length < 3) {
      setError("Enter a name, relationship, and valid contact phone number.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        const updated = await emergencyContactService.update(editingId, input);
        setContacts((current) =>
          current.map((contact) => (contact.id === updated.id ? updated : contact)),
        );
        setSuccess("Emergency contact updated.");
      } else {
        const created = await emergencyContactService.create(input);
        setContacts((current) => [...current, created]);
        setSuccess("Emergency contact added.");
      }
      setDraft(emptyContact);
      setEditingId(null);
    } catch (saveError) {
      setError(
        getApiErrorMessage(saveError, "We could not save this emergency contact."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(contact: EmergencyContact): Promise<void> {
    setMutationId(contact.id);
    setError(null);
    try {
      const updated = await emergencyContactService.update(contact.id, {
        active: !contact.active,
      });
      setContacts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (toggleError) {
      setError(
        getApiErrorMessage(toggleError, "We could not update this contact."),
      );
    } finally {
      setMutationId(null);
    }
  }

  async function removeContact(contact: EmergencyContact): Promise<void> {
    if (!window.confirm(`Remove ${contact.name} from your emergency contacts?`)) {
      return;
    }
    setMutationId(contact.id);
    setError(null);
    try {
      await emergencyContactService.remove(contact.id);
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      if (editingId === contact.id) resetForm();
    } catch (removeError) {
      setError(
        getApiErrorMessage(removeError, "We could not remove this contact."),
      );
    } finally {
      setMutationId(null);
    }
  }

  if (!isLoading && loadError) {
    return (
      <section className="card emergency-contacts-section" aria-labelledby="emergency-contacts-title">
        <div className="section-heading">
          <p className="eyebrow">Trusted people</p>
          <h2 id="emergency-contacts-title">Emergency contacts</h2>
          <p>
            Manage structured contacts for optional health-alert notifications. CareTrack never calls emergency services.
          </p>
        </div>
        <div className="compact-empty-state" role="alert">
          <span className="state-icon" aria-hidden="true">!</span>
          <div>
            <h3>Emergency contacts unavailable</h3>
            <p>{loadError}</p>
            <button
              className="button button-secondary button-small"
              onClick={() => void loadContacts()}
            >
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card emergency-contacts-section" aria-labelledby="emergency-contacts-title">
      <div className="section-heading">
        <p className="eyebrow">Trusted people</p>
        <h2 id="emergency-contacts-title">Emergency contacts</h2>
        <p>
          Manage structured contacts for optional health-alert notifications. CareTrack never calls emergency services.
          No outbound contact channel is enabled in this demo.
        </p>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      <form className="contact-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input
              value={draft.name}
              maxLength={100}
              autoComplete="name"
              disabled={isSaving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </label>
          <label className="field">
            <span>Relationship</span>
            <input
              value={draft.relationship}
              maxLength={60}
              placeholder="e.g. Parent, partner, friend"
              disabled={isSaving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, relationship: event.target.value }))
              }
              required
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              type="tel"
              value={draft.phone}
              maxLength={30}
              autoComplete="tel"
              placeholder="e.g. +961 70 123 456"
              disabled={isSaving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, phone: event.target.value }))
              }
              required
            />
          </label>
          <label className="field">
            <span>Email (optional)</span>
            <input
              type="email"
              value={draft.email}
              maxLength={254}
              autoComplete="email"
              disabled={isSaving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, email: event.target.value }))
              }
            />
          </label>
          <label className="checkbox-field field-wide">
            <input
              type="checkbox"
              checked={draft.active}
              disabled={isSaving}
              onChange={(event) =>
                setDraft((current) => ({ ...current, active: event.target.checked }))
              }
            />
            <span>Contact is active and may receive configured notifications</span>
          </label>
        </div>
        <div className="form-actions">
          <button className="button button-primary" type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : editingId ? "Update contact" : "Add contact"}
          </button>
          {editingId && (
            <button className="button button-secondary" type="button" disabled={isSaving} onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="contact-list">
        {isLoading ? (
          <div className="compact-loading" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>Loading contacts…</span>
          </div>
        ) : contacts.length === 0 ? (
          <div className="compact-empty-state">
            <span className="state-icon" aria-hidden="true">＋</span>
            <div><h3>No structured contacts yet</h3><p>Add one above when you are ready.</p></div>
          </div>
        ) : (
          contacts.map((contact) => (
            <article className="contact-item" key={contact.id}>
              <div className="contact-avatar" aria-hidden="true">
                {contact.name.trim().charAt(0).toUpperCase() || "C"}
              </div>
              <div className="contact-copy">
                <div className="badge-row">
                  <h3>{contact.name}</h3>
                  <span className={`badge ${contact.active ? "badge-completed" : "badge-neutral"}`}>
                    {contact.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p>{contact.relationship}</p>
                <div className="contact-channels">
                  <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                </div>
              </div>
              <div className="row-actions">
                <button
                  className="button button-ghost button-small"
                  disabled={mutationId === contact.id}
                  onClick={() => void toggleActive(contact)}
                >
                  {contact.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="button button-secondary button-small"
                  disabled={mutationId === contact.id}
                  onClick={() => {
                    setEditingId(contact.id);
                    setDraft(draftFromContact(contact));
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  Edit
                </button>
                <button
                  className="button button-danger-ghost button-small"
                  disabled={mutationId === contact.id}
                  onClick={() => void removeContact(contact)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
