import { useCallback, useEffect, useState } from "react";

import { getApiErrorMessage } from "../../services/api-error";
import {
  notificationService,
  type CareNotification,
} from "../../services/notification.service";

export default function NotificationsPanel() {
  const [items, setItems] = useState<CareNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await notificationService.list(8);
      setItems(result.items);
      setUnreadCount(result.unreadCount);
      setError(null);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "Notifications could not be loaded.",
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function markRead(notification: CareNotification): Promise<void> {
    if (notification.readAt) return;

    try {
      await notificationService.markRead(notification.id);
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "The notification could not be marked as read.",
        ),
      );
    }
  }

  async function enablePush(): Promise<void> {
    setIsEnablingPush(true);
    setPushMessage(null);

    try {
      await notificationService.enablePush();
      setPushMessage("Push reminders are enabled on this device.");
    } catch (requestError) {
      setPushMessage(
        requestError instanceof Error
          ? requestError.message
          : "Push reminders could not be enabled.",
      );
    } finally {
      setIsEnablingPush(false);
    }
  }

  return (
    <section className="card notifications-card" aria-labelledby="notifications-title">
      <div className="section-heading section-heading-actions">
        <div>
          <p className="eyebrow">Reminders</p>
          <h2 id="notifications-title">
            Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </h2>
        </div>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => void enablePush()}
          disabled={isEnablingPush}
        >
          {isEnablingPush ? "Enabling…" : "Enable push"}
        </button>
      </div>

      {pushMessage && <p className="notification-help" role="status">{pushMessage}</p>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {isLoading ? (
        <p className="notification-help" aria-live="polite">Loading notifications…</p>
      ) : items.length === 0 ? (
        <p className="notification-help">No reminders or overdue doses yet.</p>
      ) : (
        <div className="notification-list">
          {items.map((notification) => (
            <button
              type="button"
              key={notification.id}
              className={`notification-item${notification.readAt ? "" : " is-unread"}`}
              onClick={() => void markRead(notification)}
            >
              <span>
                <strong>{notification.title}</strong>
                <small>{notification.message}</small>
              </span>
              <time dateTime={notification.createdAt}>
                {new Date(notification.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
