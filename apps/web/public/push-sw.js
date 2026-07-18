/**
 * Push handlers, importScripts'd into the generated Workbox service worker
 * (see workbox.importScripts in vite.config.ts) — generateSW mode can't emit
 * custom listeners itself. Payload shape: apps/server/src/push.ts PushPayload.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* non-JSON push — show the fallback */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Jaffre', {
      body: data.body || '',
      icon: '/icons/pwa-192.png',
      badge: '/icons/pwa-192.png',
      // Same tag per room: a stack of "your turn" pings collapses into one.
      tag: data.tag || 'jaffre',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        // An open Jaffre window: steer it to the room and focus it.
        win.navigate(url);
        return win.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
