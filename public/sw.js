const SHELL_CACHE = "pixshift-shell-v3";
const WASM_CACHE = "pixshift-wasm-v3";

const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg"];

const WASM_PACK_URLS = [
  "/pdfjs/pdf.worker.min.mjs",
  "/ffmpeg/ffmpeg-core.js",
  "/ffmpeg/ffmpeg-core.wasm",
  "/ffmpeg/worker.js",
  "/ffmpeg/const.js",
  "/ffmpeg/errors.js",
  "/tesseract/worker.min.js",
  "/tesseract/tesseract-core-simd-lstm.wasm.js",
  "/tesseract/tesseract-core-simd-lstm.wasm",
  "/tesseract/tesseract-core-lstm.wasm.js",
  "/tesseract/tesseract-core-lstm.wasm",
  "/tesseract/eng.traineddata.gz",
];

function withIsolationHeaders(response, isDocument) {
  if (!response || response.type === "opaque") {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (isDocument) {
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== WASM_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "PREWARM_WASM") return;
  const port = event.ports && event.ports[0];
  event.waitUntil(
    (async () => {
      const cache = await caches.open(WASM_CACHE);
      let completed = 0;
      for (const url of WASM_PACK_URLS) {
        try {
          const existing = await cache.match(url);
          if (!existing) {
            const resp = await fetch(url, { credentials: "same-origin" });
            if (resp.ok) {
              await cache.put(url, resp);
            }
          }
        } catch {
          // Continue prewarming remaining assets
        }
        completed += 1;
        if (port) {
          port.postMessage({
            type: "PREWARM_PROGRESS",
            completed,
            total: WASM_PACK_URLS.length,
          });
        }
      }
      if (port) {
        port.postMessage({ type: "PREWARM_DONE", total: WASM_PACK_URLS.length });
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isWasmAsset =
    url.pathname.startsWith("/ffmpeg/") ||
    url.pathname.startsWith("/pdfjs/") ||
    url.pathname.startsWith("/tesseract/");

  const isDocument = request.mode === "navigate" || url.pathname === "/";

  if (isWasmAsset) {
    event.respondWith(
      caches.open(WASM_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          return withIsolationHeaders(cached, false);
        }
        const net = await fetch(request);
        if (net.ok) {
          await cache.put(request, net.clone());
        }
        return withIsolationHeaders(net, false);
      })
    );
    return;
  }

  if (isDocument || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then(async (net) => {
            if (net.ok) {
              await cache.put(request, net.clone());
            }
            return withIsolationHeaders(net, isDocument);
          })
          .catch(() => null);

        if (cached) {
          void networkPromise;
          return withIsolationHeaders(cached, isDocument);
        }

        const fresh = await networkPromise;
        if (fresh) return fresh;
        return Response.error();
      })
    );
  }
});
