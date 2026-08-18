self.addEventListener("push", (event) => {
  let message = {
    title: "CareTrack reminder",
    body: "You have a new CareTrack notification.",
    data: { path: "/dashboard" },
  };

  if (event.data) {
    try {
      message = { ...message, ...event.data.json() };
    } catch {
      message.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      data: message.data,
      tag: message.data?.medicationLogId || message.data?.alertId,
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedPath = event.notification.data?.path;
  const path =
    typeof requestedPath === "string" && requestedPath.startsWith("/")
      ? requestedPath
      : "/dashboard";
  const destination = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(destination);
          return client.focus();
        }
      }

      return self.clients.openWindow(destination);
    }),
  );
});
