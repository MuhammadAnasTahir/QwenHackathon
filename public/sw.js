/* Sehat Saathi service worker.
 * Responsibilities: take control immediately, surface medicine notifications,
 * and bring the alarms screen forward when a notification is tapped.
 * Intentionally NO fetch handler — the app is served normally by Next.js.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client) {
              client.navigate("/").catch(() => {});
            }
            return client.focus();
          }
        }
        return self.clients.openWindow("/");
      })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "SHOW_NOTIFICATION") {
    self.registration
      .showNotification(data.title || "صحت ساتھی", {
        body: data.body || "",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: "sehat-saathi-alarm",
        renotify: true,
        vibrate: [300, 100, 300, 100, 300],
      })
      .catch(() => {});
  }
});
