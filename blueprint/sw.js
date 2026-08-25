/**
 * Offline shell.
 *
 * Everything the app needs is a fixed, small list of static files, so this is
 * a plain precache with a cache-first read. There is no API to fall back to
 * and no data to sync: the log lives in localStorage and IndexedDB, both of
 * which work offline on their own. This worker exists so the app still opens
 * when the phone has no signal.
 */

const VERSION = "blueprint-v1";

const SHELL = [
  ".",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "icon.svg",
  "js/app.js",
  "js/ui.js",
  "js/store.js",
  "js/score.js",
  "js/habits.js",
  "js/views/today.js",
  "js/views/body.js",
  "js/views/trials.js",
  "js/views/library.js",
  "js/views/settings.js",
  "fonts/space-grotesk-latin-wght-normal.woff2",
  "fonts/ibm-plex-mono-latin-400-normal.woff2",
  "fonts/ibm-plex-mono-latin-500-normal.woff2",
  "fonts/ibm-plex-mono-latin-600-normal.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) {
        // Refresh in the background so an update lands on the next open.
        event.waitUntil(
          fetch(request)
            .then((res) => res.ok && caches.open(VERSION).then((c) => c.put(request, res.clone())))
            .catch(() => {})
        );
        return hit;
      }
      return fetch(request).catch(() =>
        request.mode === "navigate" ? caches.match("index.html") : Response.error()
      );
    })
  );
});
