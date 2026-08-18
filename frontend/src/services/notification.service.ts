import api from "./api";

export type NotificationType =
  | "MEDICATION_REMINDER"
  | "MEDICATION_OVERDUE"
  | "APPOINTMENT_REMINDER"
  | "HEALTH_ALERT"
  | "EMERGENCY_ALERT"
  | "SECURITY_ALERT"
  | "SYSTEM";

export interface CareNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: CareNotification[];
  unreadCount: number;
}

export interface NotificationPreferences {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  medicationReminders: boolean;
  appointmentReminders: boolean;
  healthAlerts: boolean;
  emergencyContactAlerts: boolean;
  securityAlerts: boolean;
  appointmentReminderHours: number;
}

export const notificationService = {
  async list(limit = 20, unreadOnly = false): Promise<NotificationList> {
    const response = await api.get<NotificationList>("/notifications", {
      params: { limit, unreadOnly },
    });
    return response.data;
  },

  async markRead(notificationId: string): Promise<void> {
    await api.patch(`/notifications/${notificationId}/read`);
  },

  async markAllRead(): Promise<void> {
    await api.patch("/notifications/read-all");
  },

  async getPreferences(): Promise<NotificationPreferences> {
    const response = await api.get<NotificationPreferences>(
      "/notifications/preferences",
    );
    return response.data;
  },

  async updatePreferences(
    input: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const response = await api.patch<NotificationPreferences>(
      "/notifications/preferences",
      input,
    );
    return response.data;
  },

  async enablePush(): Promise<void> {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      throw new Error("Push notifications are not supported by this browser.");
    }

    const permission = await window.Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }

    const [{ data }, registration] = await Promise.all([
      api.get<{ publicKey: string | null }>(
        "/notifications/push-public-key",
      ),
      navigator.serviceWorker.register("/sw.js"),
    ]);

    if (!data.publicKey) {
      throw new Error("Push notifications are not configured on the server.");
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToArrayBuffer(data.publicKey),
      }));
    const serialized = subscription.toJSON();

    if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
      throw new Error("The browser returned an incomplete push subscription.");
    }

    await api.post("/notifications/push-subscriptions", {
      endpoint: serialized.endpoint,
      expirationTime: serialized.expirationTime
        ? new Date(serialized.expirationTime).toISOString()
        : null,
      keys: serialized.keys,
    });
  },
};

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes.buffer;
}
