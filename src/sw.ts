/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// Injected at build time by vite-plugin-pwa with the hashed app-shell assets.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
