# Pixshift — Universal Client-Side Converter & Media Workbench

> **100% Client-Side · Anonymous & Zero-Login · Lazy Off-Main-Thread Engines · Self-Hosted WebAssembly · Free Forever**

Pixshift converts, compresses, edits, OCRs, and packages images, videos, audio, and PDFs **entirely inside the user's browser**. Initial page load stays lightweight (**~112 kB First Load JS** on `/`) while heavy codecs and WASM runtimes (`@ffmpeg/ffmpeg`, `pdfjs-dist`, `pdf-lib`, `tesseract.js`, `heic2any`, `jszip`) load strictly on demand under strict browser isolation (`COOP: same-origin` + `COEP: require-corp`).

**Live App:** [pixyshift.vercel.app](https://pixyshift.vercel.app)

---

## Architecture Overview

```text
Browser Input (DropZone / webkitdirectory / Paste / PWA OS File Handler)
   │
   ▼  File Detection & Metadata Probe (bounded concurrency = 4)
Workspace Controller (useConverterWorkspace + workspaceHelpers + recipes)
   │   ├── Folder Tree & Scope Filter ("__all__" | Root | nested subpath)
   │   ├── Mass Control Bar (>10 items or nested folders) + Ctrl+K Command Palette
   │   ├── Windowed Virtualized Queue (>35 jobs) + lazy IntersectionObserver Thumbnails
   │   └── Coalesced Progress Batcher (60ms flush -> @number-flow/react telemetry)
   │
   ├──► Image Pipeline ──► Dedicated OffscreenCanvas Worker Pool (<= 4 workers, main-thread fallback)
   │       ├── Geometry (Crop %/px -> Rotate 0/90/180/270 -> Flip H/V -> Aspect Resize)
   │       ├── Watermark Compositing (text / image, corners / center / tiled)
   │       ├── EXIF Binary Scanner & Lossless Fast-Path Stripper (TIFF IFD0 orientation-aware)
   │       ├── Bounded 7-Step Binary Search for targetSizeKb (with unreachable-floor warnings)
   │       └── Pure-TS Encoders: 24-bit BI_RGB BMP, Vista+ PNG-in-ICO, Capability-Gated AVIF
   │
   ├──► Media & GIF Studio Pipeline
   │       ├── Hardware Path: Mediabunny WebCodecs (MP4 / WebM / MOV when supported)
   │       └── Fallback & GIF Path: Self-Hosted FFmpeg WASM (/ffmpeg/*)
   │             ├── 2-Pass GIF palettegen / paletteuse, custom FPS, scale, loop count, reverse
   │             └── Canvas-rendered caption overlay PNG compositing (zero font dependencies)
   │
   ├──► PDF Page Studio Pipeline
   │       ├── Sequential Thumbnails: Self-Hosted /pdfjs/pdf.worker.min.mjs (page.cleanup() enforced)
   │       └── Structural Ops: pdf-lib reorder, rotate, remove, split ranges, burst, multi-PDF merge
   │
   ├──► Offline OCR Engine
   │       └── Self-Hosted tesseract.js Worker + Core + eng.traineddata.gz (/tesseract/*)
   │
   ├──► Archive Export
   │       └── JSZip Streaming Packager (STORE for pre-compressed media, DEFLATE for raster/text)
   │             ├── Deduplication ("name (1).ext") case-insensitively per directory scope
   │             └── Preserve Nested Folder Hierarchy  <──or──>  Flatten Outputs to Archive Root
   │
   └──► Dual-Mode Anonymous Output Sharing (Optional)
           ├── Mode A (Zero Server): navigator.share() OS Sheet + Compressed-SDP WebRTC DataChannel P2P
           └── Mode B (24h Vault <= 25 MB): AES-256-GCM Ciphertext (key stays strictly in URL #k= fragment)
```

---

## How Each Subsystem Works

### 1. Light Initial Bundle & On-Demand Engine Loading
- The root landing route (`/`) imports only lightweight UI shell components (`ConverterLoader` uses `next/dynamic` with `ssr: false` for the interactive workspace).
- Heavy libraries (`mediabunny`, `@ffmpeg/ffmpeg`, `pdfjs-dist`, `pdf-lib`, `tesseract.js`, `heic2any`, `jszip`, `@vercel/blob/client`) are loaded dynamically at conversion/studio invocation time so everyday visitors pay near-zero JavaScript cost until they use an engine.

### 2. Batch Folder Ingestion, Virtualization & Telemetry
- **Recursive Ingestion ([folderDrop.ts](src/lib/utils/folderDrop.ts)):** Traverses dropped directories recursively with `webkitGetAsEntry()` (looping `readEntries()` per directory-reader spec) and normalizes `<input webkitdirectory>` uploads into `{ file, relativePath, folderPath }`, skipping dotfiles (`.DS_Store`) and 0-byte placeholders.
- **Mass Control Workbench ([MassControlBar.tsx](src/components/converter/MassControlBar.tsx)):** Automatically surfaces when `jobs.length > 10` or nested subfolders are detected, letting users filter by folder, apply a target format or 1-click recipe across scope, configure token-based batch renaming (`{folder}_{name}_{index:3}`), or switch ZIP export between `preserve` and `flatten`.
- **60fps Scaling ([concurrency.ts](src/lib/utils/concurrency.ts), [FileQueue.tsx](src/components/converter/FileQueue.tsx)):** Limits concurrent background jobs via a work-stealing `runConcurrentPool`, batches worker progress ticks every `60ms` via `createBatchedUpdater` to eliminate React render storms, windows the queue DOM when `jobs.length > 35`, and gates preview ObjectURL allocation with `IntersectionObserver`. Every generated `ObjectURL` is tracked and revoked on remove, format change, clear, or unmount.

### 3. Image Worker Pool, Geometry, Watermarks & Smart Compression
- **Worker Pool ([imageWorkerPool.ts](src/lib/engines/imageWorkerPool.ts), [imageWorker.ts](src/lib/engines/imageWorker.ts)):** Executes transforms inside Dedicated Workers backed by `OffscreenCanvas` (falling back seamlessly to the main thread for HEIC or restricted runtimes).
- **Binary & Metadata Integrity ([exif.ts](src/lib/converters/exif.ts), [encoders.ts](src/lib/converters/encoders.ts), [imageConverter.ts](src/lib/converters/imageConverter.ts)):**
  - Scans JPEG `APP1` / `XMP` / `GPS` / `IPTC` / `COM` segments and TIFF `Orientation` tags before selecting a lossless binary strip fast-path (rotated JPEGs bake upright via `createImageBitmap(..., { imageOrientation: "from-image" })`).
  - Encodes genuine binary `.bmp` (`BM` 24-bit `BI_RGB`) and `.ico` (`00 00 01 00` Vista+ PNG-in-ICO capped at `256x256`) headers rather than silently falling back to PNG bytes.
  - Rejects AVIF exports explicitly if the browser silently returns `image/png` instead of `image/avif`.
  - Binary-searches lossy `quality` (up to 7 iterations) to fit user-specified `targetSizeKb` budgets and attaches an explicit warning badge when a target KB floor cannot be met cleanly.

### 4. Video-to-GIF Studio & Media Transcoding
- **Hybrid Routing ([mediaConverter.ts](src/lib/converters/mediaConverter.ts), [webcodecsMedia.ts](src/lib/converters/webcodecsMedia.ts)):** Routes compatible `mp4` / `webm` / `mov` jobs through hardware `WebCodecs` (`mediabunny`) first and seamlessly falls back to self-hosted `@ffmpeg/ffmpeg` WASM on unsupported codecs/browsers or for audio/GIF workflows.
- **GIF Studio ([GifStudioModal.tsx](src/components/converter/GifStudioModal.tsx)):** Builds deterministic two-pass `palettegen`/`paletteuse` FFmpeg graphs supporting timeline trim (`-ss` / `-to`), custom `fps`, output width, loop count (`-loop`), `reverse`, and optional canvas-rasterized PNG caption overlays.

### 5. Visual PDF Page Studio & Offline OCR
- **PDF Manipulation ([pdfTools.ts](src/lib/converters/pdfTools.ts), [documentConverter.ts](src/lib/converters/documentConverter.ts), [PdfStudioModal.tsx](src/components/converter/PdfStudioModal.tsx)):** Renders page thumbnails sequentially using `/pdfjs/pdf.worker.min.mjs` (enforcing `page.cleanup()` + `pdf.destroy()` in `finally` blocks) and executes reordering, rotation, deletion, range splitting (`"1-2, 3-4"`), bursting, and multi-PDF/image merging via `pdf-lib`.
- **Self-Hosted OCR ([ocrEngine.ts](src/lib/engines/ocrEngine.ts), [OcrResultModal.tsx](src/components/converter/OcrResultModal.tsx)):** Runs `tesseract.js` against same-origin assets in `public/tesseract/` (`worker.min.js`, SIMD/LSTM WASM cores, and `eng.traineddata.gz`) with zero CDN or external requests, supporting single images and sequential multi-page PDFs.

### 6. Cross-Origin Isolation, PWA & Dual-Mode Sharing
- **Isolation & Offline PWA ([next.config.ts](next.config.ts), [manifest.ts](src/app/manifest.ts), [sw.js](public/sw.js), [PwaRegistrar.tsx](src/components/PwaRegistrar.tsx)):** Every response serves `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` so `SharedArrayBuffer` works both online and from the Service Worker cache. `sw.js` caches only the light app shell on install and caches `/ffmpeg/*`, `/pdfjs/*`, and `/tesseract/*` lazily (with an opt-in **"Save Tools Offline"** button). OS `file_handlers` + `launchQueue` allow opening desktop files directly in Pixshift.
- **Anonymous Output Sharing ([ShareModal.tsx](src/components/converter/ShareModal.tsx), [crypto.ts](src/lib/share/crypto.ts), [p2p.ts](src/lib/share/p2p.ts), [storage.ts](src/lib/share/storage.ts), `/s/[id]`):**
  - **Mode A (Zero Server):** Native `navigator.share({ files })` OS sharing plus serverless compressed-SDP WebRTC `RTCDataChannel` P2P transfers defaulting to strict LAN (`iceServers: []`, with opt-in Cloudflare STUN toggle).
  - **Mode B (24h `AES-256-GCM` Encrypted Vault):** Encrypts file + metadata in-browser, keeps the base64url key strictly inside URL fragment `#k=...` (never transmitted to servers), bypasses Vercel's 4.5 MB function limit for payloads up to 25 MB via `@vercel/blob/client` when `BLOB_READ_WRITE_TOKEN` is configured (falling back cleanly to an ephemeral `.next/cache/pixshift-shares` store for local/Playwright verification), and supports `1h`/`24h` TTL plus optional Burn-After-Read.

---

## Project Layout

```text
src/
├── app/
│   ├── api/share/          # Optional E2EE encrypted share token/upload/consume routes
│   ├── s/[id]/             # Client-side AES-256-GCM & P2P share recipient page
│   ├── manifest.ts         # PWA manifest + OS file_handlers & share_target
│   ├── opengraph-image.tsx # Dynamic 1200x630 OpenGraph PNG card
│   └── page.tsx            # Light landing shell + dynamic Workspace entry
├── components/
│   ├── Header.tsx / Footer.tsx / Faq.tsx / PwaRegistrar.tsx
│   └── converter/          # DropZone, MassControlBar, FileQueue, SettingsModal, GifStudioModal, PdfStudioModal, OcrResultModal, VisualDiffModal, ShareModal, CommandPalette, SavingsTelemetry
└── lib/
    ├── converters/         # detector, registry, encoders (BMP/ICO), exif, imageConverter, mediaConverter, webcodecsMedia, documentConverter, pdfTools, workspaceHelpers
    ├── engines/            # imageWorker, imageWorkerPool, ocrEngine
    ├── share/              # AES-GCM crypto, pure-TS QR SVG generator, WebRTC P2P, hybrid Blob/local storage
    ├── utils/              # archive (JSZip), concurrency pool & batcher, folderDrop, batch rename
    └── workspace/          # useConverterWorkspace hook, built-in & localStorage recipes
scripts/copy-wasm-assets.mjs # Syncs @ffmpeg/core, pdfjs-dist worker & tesseract.js assets into public/
tests/
├── fixtures/               # Deterministic generators incl. 200-image nested folder & EXIF/PDF/AV fixtures
├── unit/                   # 15 Vitest unit suites (56 tests)
└── e2e/                    # Playwright Chromium E2E suites running against production `next start`
```

---

## Local Development & Verification

```bash
# Install dependencies (automatically runs `npm run sync-assets` into public/)
npm install

# Run local dev server
npm run dev

# Full quality & verification gate
npm run lint        # ESLint 9
npm run typecheck   # TypeScript strict + noUncheckedIndexedAccess
npm test            # Vitest (56 unit tests)
npm run build       # Production Next.js build + asset sync
npm run test:e2e    # Playwright Chromium (19 E2E tests against `next start`)
```

---

## Deployment Notes (Vercel)

- `next.config.ts` and `vercel.json` enforce `COOP: same-origin` and `COEP: require-corp` globally.
- All core conversions, folder ZIP exports, Video-to-GIF rendering, PDF Page Studio editing, OCR, and Mode A P2P sharing run with **zero environment variables**.
- To enable **Mode B (24h Encrypted Vault Links across devices)** on Vercel, connect a **Vercel Blob** store (`BLOB_READ_WRITE_TOKEN`) to the project environment variables.

---

## License

Licensed under the Apache 2.0 License. Built by [Lakshay](https://github.com/vrsn001).
