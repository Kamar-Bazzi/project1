import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../services/api-error";
import { careService } from "../../services/care.service";
import type {
  EmergencyEvent,
  EmergencyEventResult,
  EmergencyRecentReadings,
} from "../../types/care";
import type { EmergencyContact } from "../../types/health";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export default function EmergencyPage() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<EmergencyEvent | null>(null);
  const [recentReadings, setRecentReadings] = useState<EmergencyRecentReadings>({ measurements: [], wearableMetrics: [] });
  const [note, setNote] = useState("");
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<EmergencyEventResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const overview = await careService.emergencyOverview();
      setContacts(overview.contacts);
      setEvents(overview.items);
      setActiveEvent(overview.activeEvent);
      setRecentReadings(overview.recentReadings);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Emergency information could not be loaded.",
        ),
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function requestLocation(): void {
    if (!("geolocation" in navigator)) {
      setError("Location sharing is not supported by this browser.");
      return;
    }
    setIsLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setIsLocating(false);
      },
      () => {
        setError(
          "Your location could not be accessed. You can still send an alert without it.",
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function trigger(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (
      !window.confirm(
        "Send an urgent CareTrack alert to your configured care contacts? This does not call emergency services.",
      )
    ) return;

    setIsSending(true);
    setError(null);
    setResult(null);
    try {
      const response = await careService.createEmergencyEvent({
        note: note.trim() || null,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
      setResult(response);
      setEvents((current) => [response.event, ...current]);
      setActiveEvent(response.event);
      setContacts(response.contacts);
      setRecentReadings(response.recentReadings);
      setNote("");
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Your CareTrack alert could not be sent. Contact emergency services directly if you need immediate help.",
        ),
      );
    } finally {
      setIsSending(false);
    }
  }

  async function resolve(item: EmergencyEvent): Promise<void> {
    if (!window.confirm("Mark this event resolved?")) return;
    try {
      const updated = await careService.resolveEmergencyEvent(item.id);
      setEvents((current) =>
        current.map((event) => (event.id === updated.id ? updated : event)),
      );
      setActiveEvent(null);
      setResult(null);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "This event could not be resolved."),
      );
    }
  }

  return (
    <main className="page-shell page-shell-narrow emergency-page">
      <section className="emergency-hero">
        <span className="emergency-hero-icon" aria-hidden="true">+</span>
        <div>
          <p className="eyebrow">I feel unwell</p>
          <h1>Request help from your care contacts</h1>
          <p>CareTrack can record an urgent event and notify configured contacts. It does not contact an ambulance or replace emergency services.</p>
        </div>
      </section>
      <div className="emergency-services-notice" role="note">
        <strong>Are you in immediate danger?</strong>
        <span>Call your local emergency number now. Do not wait for an app response.</span>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {result && (
        <section className="card emergency-result" role="status">
          <span className="state-icon" aria-hidden="true">✓</span>
          <div>
            <h2>{result.guidance.headline}</h2>
            <p>
              {result.contacts.filter((contact) => contact.email).length} email-capable contact
              {result.contacts.filter((contact) => contact.email).length === 1 ? "" : "s"} included in the delivery workflow
              {result.notificationQueued
                ? "."
                : "; automatic notification delivery was not confirmed."}
              {result.contacts.some((contact) => !contact.email) && " Call phone-only contacts directly."}
            </p>
            <ul>
              {result.guidance.instructions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <small>{result.guidance.disclaimer}</small>
          </div>
        </section>
      )}

      <RecentReadings readings={recentReadings} />

      <div className="emergency-grid">
        <section className="card form-card">
          <div className="section-heading">
            <p className="eyebrow">Urgent alert</p>
            <h2>Tell your contacts you feel unwell</h2>
            <p>Add context if you can. The note is optional.</p>
          </div>
          <form className="form-stack" onSubmit={trigger}>
            <label className="field">
              <span>What is happening? <small>(optional)</small></span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1_000}
                placeholder="For example: I feel dizzy and need someone to check on me."
                disabled={isSending}
              />
            </label>
            <div className="location-control">
              <div>
                <strong>Share current location</strong>
                <small>
                  {location
                    ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                    : "No location attached"}
                </small>
              </div>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={requestLocation}
                disabled={isLocating || isSending}
              >
                {isLocating
                  ? "Locating…"
                  : location
                    ? "Update location"
                    : "Add location"}
              </button>
            </div>
            {activeEvent && <div className="alert alert-warning" role="status">An urgent event is already active from {formatDate(activeEvent.triggeredAt)}. Resolve it before starting another.</div>}
            <button type="submit" className="emergency-trigger-button" disabled={isSending || activeEvent !== null}>
              {isSending ? "Sending alert…" : activeEvent ? "Urgent event already active" : "I feel unwell — notify my contacts"}
            </button>
          </form>
        </section>

        <aside className="card data-section emergency-contacts-card">
          <div className="section-heading">
            <p className="eyebrow">Who may be notified</p>
            <h2>Active emergency contacts</h2>
          </div>
          {contacts.length === 0 ? (
            <div className="compact-empty">
              <span className="state-icon" aria-hidden="true">!</span>
              <div>
                <strong>No active contacts</strong>
                <small>Add contacts from your profile before relying on this workflow.</small>
              </div>
            </div>
          ) : (
            <div className="emergency-contact-list">
              {contacts.map((contact) => (
                <article key={contact.id}>
                  <span className="contact-avatar" aria-hidden="true">
                    {contact.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <strong>{contact.name}</strong>
                    <small>{contact.relationship}</small>
                    <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>

      <section className="card data-section emergency-history">
        <div className="section-heading">
          <p className="eyebrow">Activity</p>
          <h2>Recent urgent events</h2>
        </div>
        {events.length === 0 ? (
          <p className="muted-message">No events have been recorded.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Triggered</th><th>Note</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {events.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.triggeredAt)}</td>
                    <td>{item.note || "No note"}</td>
                    <td>
                      {item.latitude !== null && item.longitude !== null
                        ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
                        : "Not shared"}
                    </td>
                    <td><span className={`badge badge-${item.status.toLowerCase()}`}>{item.status}</span></td>
                    <td>
                      {item.status === "ACTIVE" && (
                        <button type="button" className="button button-secondary button-small" onClick={() => void resolve(item)}>
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function readingLabel(reading: EmergencyRecentReadings["measurements"][number]): string {
  const raw = reading.type ?? reading.metricType ?? "Reading";
  return raw.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function RecentReadings({ readings }: { readings: EmergencyRecentReadings }) {
  const items = [
    ...readings.measurements.map((reading) => ({ ...reading, kind: "Measurement" })),
    ...readings.wearableMetrics.map((reading) => ({ ...reading, kind: "Wearable" })),
  ].sort((first, second) => Date.parse(second.measuredAt) - Date.parse(first.measuredAt)).slice(0, 8);

  return (
    <section className="card emergency-readings" aria-labelledby="recent-reading-heading">
      <div className="section-heading"><p className="eyebrow">Recent context</p><h2 id="recent-reading-heading">Latest recorded readings</h2><p>These values are shown to help you communicate context. CareTrack does not diagnose what they mean.</p></div>
      {items.length === 0 ? <p className="muted-message">No recent measurement or wearable readings are available.</p> : <div className="emergency-reading-grid">{items.map((reading) => <article key={`${reading.kind}:${reading.id}`}><span>{readingLabel(reading)}</span><strong>{reading.value}{reading.secondaryValue === null ? "" : `/${reading.secondaryValue}`} <small>{reading.unit}</small></strong><time dateTime={reading.measuredAt}>{reading.kind} · {formatDate(reading.measuredAt)}</time></article>)}</div>}
    </section>
  );
}
