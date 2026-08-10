/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// Injected at build time by vite-plugin-pwa with the hashed app-shell assets.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

interface PushPayload {
  kind: string;
  title: string;
  body: string;
  tab: string;
  urgent: boolean;
}

// Long, insistent buzz for a call; a short double-tap for everything else.
const RING_PATTERN = [500, 260, 500, 260, 500, 260, 500];
const ALERT_PATTERN = [180, 90, 180];

const APP_SCOPE = self.registration.scope;

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = {
      kind: 'message',
      title: 'Mobu',
      body: event.data.text(),
      tab: 'home',
      urgent: false,
    };
  }

  event.waitUntil(
    (async () => {
      // If a window is already focused, the in-app toast handles it — a system
      // notification on top of that is just noise.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const focused = clients.find((c) => 'focused' in c && (c as WindowClient).focused);
      if (focused) {
        focused.postMessage({ source: 'mobu-push', payload });
        return;
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: `${APP_SCOPE}icons/icon-192.png`,
        badge: `${APP_SCOPE}icons/icon-192.png`,
        vibrate: payload.urgent ? RING_PATTERN : ALERT_PATTERN,
        // Same tag replaces rather than stacks, so ten messages don't become
        // ten separate notifications to dismiss.
        tag: payload.kind === 'call' ? 'mobu-call' : `mobu-${payload.tab}`,
        renotify: payload.urgent,
        requireInteraction: payload.urgent,
        data: { tab: payload.tab, kind: payload.kind },
        actions:
          payload.kind === 'call'
            ? [
                { action: 'answer', title: 'Answer' },
                { action: 'decline', title: 'Decline' },
              ]
            : [],
      } as NotificationOptions);
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  const data = (event.notification.data ?? {}) as { tab?: string; kind?: string };
  event.notification.close();

  if (event.action === 'decline') return;

  const target = `${APP_SCOPE}?tab=${encodeURIComponent(data.tab ?? 'home')}`;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse an existing tab where possible rather than piling up windows.
      for (const client of clients) {
        if (client.url.startsWith(APP_SCOPE) && 'focus' in client) {
          client.postMessage({ source: 'mobu-navigate', tab: data.tab ?? 'home' });
          return (client as WindowClient).focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// Chrome can rotate a subscription out from under us; re-registering keeps the
// endpoint we have on the server from silently going dead.
// Not in ServiceWorkerGlobalScopeEventMap, so the handler arrives as a bare
// Event and has to be widened to reach waitUntil.
self.addEventListener('pushsubscriptionchange', (event: Event) => {
  (event as ExtendableEvent).waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ source: 'mobu-resubscribe' });
      }
    })(),
  );
});
