const CADENCE_APP_URL = self.location.origin + "/";
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const target = typeof payload.url === "string" ? payload.url : CADENCE_APP_URL;
  let safeTarget = CADENCE_APP_URL;
  try {
    const parsed = new URL(target, self.location.origin);
    if (parsed.origin === self.location.origin) safeTarget = parsed.href;
  } catch { /* Only same-origin links are allowed. */ }
  const options = {
    body: payload.body || "Your next small step is ready.",
    icon: "/cadence-icon.svg",
    badge: "/cadence-icon.svg",
    tag: payload.tag || "cadence-reminder",
    renotify: false,
    requireInteraction: true,
    vibrate: [180, 80, 180],
    timestamp: Date.now(),
    data: {
      url: safeTarget,
      kind: payload.kind || "general",
      id: payload.id || "",
      soundUrl: payload.soundUrl || ""
    },
    actions: [{ action: "open", title: "Open Cadence" }]
  };
  event.waitUntil(self.registration.showNotification(payload.title || "Cadence reminder", options));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const requestedUrl = event.notification.data && event.notification.data.url;
  let target = CADENCE_APP_URL;
  try {
    const parsed = new URL(typeof requestedUrl === "string" ? requestedUrl : CADENCE_APP_URL, self.location.origin);
    if (parsed.origin === self.location.origin) target = parsed.href;
  } catch { /* Fall back to the app home. */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        try {
          if ("navigate" in client && client.url !== target) await client.navigate(target);
        } catch { /* Focusing the existing window is still useful. */ }
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
