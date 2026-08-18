import { type FormEvent, useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../services/api-error";
import {
  notificationService,
  type CareNotification,
  type NotificationPreferences,
  type NotificationType,
} from "../services/notification.service";

const notificationIcons: Record<NotificationType, string> = {
  MEDICATION_REMINDER: "Rx",
  MEDICATION_OVERDUE: "!",
  APPOINTMENT_REMINDER: "Cal",
  HEALTH_ALERT: "♥",
  EMERGENCY_ALERT: "+",
  SECURITY_ALERT: "S",
  SYSTEM: "i",
};

function formatDate(value: string): string {
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

export default function NotificationsPage() {
  const [items, setItems] = useState<CareNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const [notificationResult, preferenceResult] = await Promise.all([
        notificationService.list(100, unreadOnly),
        notificationService.getPreferences(),
      ]);
      setItems(notificationResult.items);
      setUnreadCount(notificationResult.unreadCount);
      setPreferences(preferenceResult);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "We could not load your notification center."));
    } finally {
      setIsLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(notification: CareNotification): Promise<void> {
    if (notification.readAt) return;
    try {
      await notificationService.markRead(notification.id);
      setUnreadCount((current) => Math.max(0, current - 1));
      if (unreadOnly) setItems((current) => current.filter((item) => item.id !== notification.id));
      else setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "The notification could not be marked as read."));
    }
  }

  async function markAllRead(): Promise<void> {
    setIsSaving(true); setError(null); setMessage(null);
    try {
      await notificationService.markAllRead();
      setUnreadCount(0);
      if (unreadOnly) setItems([]);
      else setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      setMessage("All notifications marked as read.");
    } catch (requestError) { setError(getApiErrorMessage(requestError, "Notifications could not be updated.")); }
    finally { setIsSaving(false); }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!preferences) return;
    setIsSaving(true); setError(null); setMessage(null);
    try { setPreferences(await notificationService.updatePreferences(preferences)); setMessage("Notification preferences saved."); }
    catch (requestError) { setError(getApiErrorMessage(requestError, "Preferences could not be saved.")); }
    finally { setIsSaving(false); }
  }

  async function enablePush(): Promise<void> {
    setIsEnablingPush(true); setError(null); setMessage(null);
    try {
      await notificationService.enablePush();
      const updated = await notificationService.updatePreferences({ pushEnabled: true });
      setPreferences(updated);
      setMessage("Push notifications are enabled on this device.");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Push could not be enabled."); }
    finally { setIsEnablingPush(false); }
  }

  return (
    <main className="page-shell page-shell-narrow">
      <header className="page-heading"><p className="eyebrow">Stay informed</p><h1>Notification center</h1><p>Review reminders and alerts, then choose how CareTrack may contact you.</p></header>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}

      <section className="card data-section notification-center-card" aria-labelledby="notification-inbox-title">
        <div className="section-heading section-heading-actions"><div><p className="eyebrow">Inbox</p><h2 id="notification-inbox-title">Notifications {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}</h2><p>Open an unread item to mark it as read.</p></div><div className="row-actions"><div className="period-selector compact-period-selector" role="group" aria-label="Notification filter"><button type="button" className={!unreadOnly ? "is-active" : ""} onClick={() => setUnreadOnly(false)}>All</button><button type="button" className={unreadOnly ? "is-active" : ""} onClick={() => setUnreadOnly(true)}>Unread</button></div><button type="button" className="button button-secondary button-small" disabled={isSaving || unreadCount === 0} onClick={() => void markAllRead()}>Mark all read</button></div></div>
        {isLoading ? <div className="inline-state"><span className="spinner" aria-hidden="true" /><p>Loading notifications…</p></div> : items.length === 0 ? <div className="inline-state"><span className="state-icon" aria-hidden="true">✓</span><h3>{unreadOnly ? "You’re all caught up" : "No notifications yet"}</h3><p>Medication, appointment, health, emergency, and security updates will appear here.</p></div> : <div className="notification-center-list">{items.map((notification) => <button type="button" key={notification.id} className={`notification-center-item${notification.readAt ? "" : " is-unread"}`} onClick={() => void markRead(notification)}><span className={`notification-type-icon notification-type-${notification.type.toLowerCase()}`} aria-hidden="true">{notificationIcons[notification.type]}</span><span><span className="badge-row"><strong>{notification.title}</strong>{!notification.readAt && <span className="badge badge-active">New</span>}</span><small>{notification.message}</small><time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time></span></button>)}</div>}
      </section>

      {preferences && <section className="card form-card notification-preferences-card" aria-labelledby="notification-preferences-title"><div className="section-heading section-heading-actions"><div><p className="eyebrow">Delivery</p><h2 id="notification-preferences-title">Notification preferences</h2><p>Critical information remains visible in your secure in-app history.</p></div><button type="button" className="button button-secondary button-small" disabled={isEnablingPush} onClick={() => void enablePush()}>{isEnablingPush ? "Enabling…" : preferences.pushEnabled ? "Reconnect push" : "Enable push"}</button></div><form onSubmit={savePreferences} className="preference-form"><PreferenceGroup title="Channels"><PreferenceToggle label="In-app notifications" description="Show alerts in CareTrack." checked={preferences.inAppEnabled} onChange={(checked) => setPreferences((current) => current ? { ...current, inAppEnabled: checked } : current)} /><PreferenceToggle label="Email" description="Send eligible alerts to your verified email." checked={preferences.emailEnabled} onChange={(checked) => setPreferences((current) => current ? { ...current, emailEnabled: checked } : current)} /><PreferenceToggle label="Push" description="Send browser push notifications to subscribed devices." checked={preferences.pushEnabled} onChange={(checked) => setPreferences((current) => current ? { ...current, pushEnabled: checked } : current)} /></PreferenceGroup><PreferenceGroup title="Topics"><PreferenceToggle label="Medication reminders" description="Scheduled and overdue dose notices." checked={preferences.medicationReminders} onChange={(checked) => setPreferences((current) => current ? { ...current, medicationReminders: checked } : current)} /><PreferenceToggle label="Appointment reminders" description="Upcoming visit reminders." checked={preferences.appointmentReminders} onChange={(checked) => setPreferences((current) => current ? { ...current, appointmentReminders: checked } : current)} /><PreferenceToggle label="Health alerts" description="Changes detected by your alert rules." checked={preferences.healthAlerts} onChange={(checked) => setPreferences((current) => current ? { ...current, healthAlerts: checked } : current)} /><PreferenceToggle label="Emergency contact alerts" description="Updates related to emergency workflows." checked={preferences.emergencyContactAlerts} onChange={(checked) => setPreferences((current) => current ? { ...current, emergencyContactAlerts: checked } : current)} /><PreferenceToggle label="Security alerts" description="Suspicious sign-ins and session changes." checked={preferences.securityAlerts} onChange={(checked) => setPreferences((current) => current ? { ...current, securityAlerts: checked } : current)} /></PreferenceGroup><label className="field preference-hours"><span>Appointment reminder lead time</span><select value={preferences.appointmentReminderHours} onChange={(event) => setPreferences((current) => current ? { ...current, appointmentReminderHours: Number(event.target.value) } : current)}>{[1, 2, 6, 12, 24, 48, 72, 168].map((hours) => <option value={hours} key={hours}>{hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours / 24} day${hours === 24 ? "" : "s"}`} before</option>)}</select></label><button type="submit" className="button button-primary" disabled={isSaving}>{isSaving ? "Saving…" : "Save preferences"}</button></form></section>}
    </main>
  );
}

function PreferenceGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="preference-group"><legend>{title}</legend>{children}</fieldset>;
}

function PreferenceToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="preference-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="toggle-track" aria-hidden="true"><span /></span></label>;
}
