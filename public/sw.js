/* TenPoint service worker — handles Push API events and shows notifications. */

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const title = payload.title || "TenPoint reminder";
  const options = {
    body: payload.body || "",
    icon: payload.icon || undefined,
    badge: payload.badge || undefined,
    tag: payload.tag || "tenpoint-reminder",
    renotify: true,
    data: { url: payload.url || "/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
