# Pixshift v3 — Modular Worker Architecture, Batch Power Suite, Studios, OCR, PWA & Zero-Knowledge Sharing Design

**Date:** 2026-11-27  
**Project:** Pixshift (`C:\Users\HP\Pixshift`)  
**Deployment Target:** Vercel (`pixyshift` / `https://pixyshift.vercel.app`)  
**Status:** Draft for Builder Review & User Approval  

---

## 1. Intent and Why

Audit of the repository (`v2.1-prod`, `0f041aa`) shows a clean ~111 kB initial Next.js bundle, self-hosted `/ffmpeg` and `/pdfjs` assets under strict `COOP: same-origin` / `COEP: require-corp`, and a solid v2 foundation — **but two gaps hold it back from an elite production SaaS experience:**

1. **Half-Wired Batch & Power Modules:** Types and helper modules from `0f041aa` (`folderDrop.ts` `extractDroppedFileEntries`, `archive.ts` `buildZipEntriesFromJobs`, `rename.ts`, `concurrency.ts`, `src/lib/converters/workspaceHelpers.ts`, and extended `ConversionSettings` fields `targetSizeKb`, `crop`, `rotateDeg`, `flipH`, `flipV`, `watermark`, `gifLoop`) exist on disk but are **not wired** into `ConverterWorkspace.tsx`, `DropZone.tsx`, `FileQueue.tsx`, `ActionToolbar.tsx`, `SettingsModal.tsx`, `imageConverter.ts`, or `mediaConverter.ts`. A duplicate `src/components/converter/workspaceHelpers.ts` also lingers.
2. **Missing Category-Leading Free Workflows & Architecture Scaling:** Rendering 200+ DOM queue rows + running synchronous Canvas encodes stalls the main thread. Users want 100% anonymous, zero-login access to **Live Smart Compression Dial, Video-to-GIF Editor, Visual PDF Page Studio, Client-Side OCR, Offline PWA + OS File Handling, and Anonymous Output Sharing** without inflating the initial page load.

Pixshift v3 unifies the architecture around **zero-bloat lazy engines, off-main-thread workers, windowed large-batch UI, and strict zero-login privacy**.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Complete & Wire Batch Foundations:** Connect nested folder ingestion, immediate mass format/preset bar (auto-surfaced for folders or `>10` files), folder filtering, `.zip` preserve-vs-flatten structure toggle, batch pattern renaming, bounded worker concurrency, and batched state flushes.
- **Keep Landing Light (`<= 135 kB` First Load JS on `/`):** Heavy engines (`@ffmpeg/ffmpeg`, `pdfjs-dist`, `pdf-lib`, `tesseract.js`, QR/WebRTC share) stay strictly code-split and load **only** when triggered.
- **Responsive at 200–500+ Files:** Offload Canvas/OffscreenCanvas transforms to Web Workers, coalesce progress ticks, and virtualize/window queue rows + lazy thumbnails so scrolling stays 60fps.
- **Smooth Telemetry Instrumentation:** Expand `SavingsTelemetry` with live `@number-flow/react` telemetry (`Progress %`, `Completed/Total`, `Files/s`, `MB/s`, `Bytes Saved`, `ETA`, `.zip` packing progress), respecting `prefers-reduced-motion`.
- **Elite Free Pro Studios (Zero Login):**
  1. **Smart Compression Studio:** Live quality/target-KB dial, debounce-rendered split preview, live compressed size estimation, format savings advisor (`WebP` vs `AVIF` vs `JPEG`), rotate/flip/crop, text/image watermarks, EXIF inspection & stripping.
  2. **Video-to-GIF & Media Studio:** Timeline trim handles, FPS slider (`5–30`), width scale, loop count (`0 = infinite` or `1..N`), reverse toggle, caption overlay, inline GIF preview, plus audio trim/bitrate.
  3. **PDF Page Studio:** Visual page grid to reorder, rotate (`90°/180°/270°`), delete, extract/split ranges (or 1 PDF per page), and merge multiple PDFs/images.
  4. **Client-Side OCR (`tesseract.js`):** Extract text from images or PDFs completely in-browser with multi-language selection, copy-to-clipboard, and `.txt` download.
  5. **Offline-First PWA + OS File Handlers:** Service Worker caching app shell + self-hosted WASM/worker binaries under `COOP`/`COEP`, plus `file_handlers` (`window.launchQueue`) & Web Share Target.
  6. **Dual-Mode Anonymous Output Sharing:**
     - **Mode A (Zero-Server Instant):** Native OS Share (`navigator.share({ files })`) + LAN/Live WebRTC P2P `RTCDataChannel` drop with QR link.
     - **Mode B (24h Zero-Knowledge E2EE Link):** Client-side Web Crypto `AES-256-GCM` encryption where the decryption key lives **exclusively in URL `#fragment`**, ciphertext uploads to a pluggable ephemeral edge store (Vercel Blob / Cloudflare R2 with 24h TTL + optional burn-after-read), and `/s/[id]` decrypts in-browser.

### Non-Goals
- User accounts, OAuth logins, paid tiers, persistent user libraries, or third-party cloud drive imports (Google Drive / Dropbox OAuth).
- Server-side transcoding, server-side OCR, or unencrypted server file storage.
- Multi-gigabyte unencrypted public CDN relays (`Mode B` enforces an explicit max payload cap of **25 MB** per shared link; larger outputs route through **Mode A P2P / Local Download**).

### Anti-Goals
- **Upfront WASM Eager Loading:** Never fetch FFmpeg, PDF.js, pdf-lib, or Tesseract assets on initial page load.
- **Fake Progress / Fake Compression:** Target-size compression must never silently exceed the KB target without surfacing `targetUnreachableWarning`. Share links must never transmit keys to the server.
- **Unscoped Global Regressions:** Never drop `COOP: same-origin` or `COEP: require-corp` headers (`next.config.ts`, `vercel.json`, Service Worker responses).

---

## 3. Hard Constraints & Stack

1. **Stack Compatibility:** Next.js `15.5.29` App Router, React `19`, TypeScript `5.7+` (`strict: true`, `noUncheckedIndexedAccess: true`), Tailwind CSS `v3.4.16` (`tailwind.config.ts`), ESLint `9` (`eslint@^9.39.5` + `eslint-config-next@15.5.29`), Vitest `v5`, Playwright Chromium.
2. **Cross-Origin Isolation (`COOP` / `COEP`):** All Service Worker cached responses and dynamically loaded WASM workers (`/ffmpeg/*`, `/pdfjs/*`, `/tesseract/*`) MUST be served same-origin (or include `Cross-Origin-Resource-Policy: same-origin`).
3. **Privacy Invariant:** Ordinary conversions (Images, Video/GIF, Audio, PDF Studio, OCR) MUST make **zero** network requests carrying user file bytes. Only explicit opt-in user click on **Encrypted Share Link** transmits **AES-256-GCM ciphertext**; **P2P Drop** uses SDP signaling metadata only (`0` file bytes on server).
4. **Telemetry & Copy Consistency:** Preserve **Pixshift** branding, WCAG AA contrast (`>= 4.5:1`), `prefers-reduced-motion`, and existing Teenage Engineering / Cobalt & Acid Lime (`#c8f03c` / `#60a5fa` / `#f03c8c` on `#0a0a0b` / `#111113` / `#18181b`) instrument tokens.

---

## 4. Evaluated Architecture & Module Design

### 4.1 Workspace Architecture & State Unification
- **Consolidate Helpers:** Delete duplicate `src/components/converter/workspaceHelpers.ts` after moving any unique imports (`src/lib/converters/workspaceHelpers.ts` becomes the single source of truth).
- **Typed Reducer + URL Registry (`src/lib/workspace/useConverterWorkspace.ts`):**
  - Centralizes `jobs`, `folderFilter` (`ALL_FOLDERS_FILTER` | `""` | subfolder string), `zipMode` (`"preserve"` | `"flatten"`), `mergeToPdf`, `globalRename`, `isConverting`, `zipProgressPct`, and `telemetry` (`computeBatchTelemetrySnapshot`).
  - Tracks every generated `ObjectURL` in a single registry so removal, format update, re-run, clear, and unmount deterministically revoke all URLs.
  - Exposes `AbortController` batch cancellation so users can stop an in-flight 200-file batch cleanly without orphaned workers.
- **Folder-Aware Ingestion (`DropZone.tsx`):**
  - Upgrade `handleDrop`, file picker, `webkitdirectory` picker, and paste handler to pass `DroppedFileEntry[]` (`normalizeInputFileEntries` / `extractDroppedFileEntries`) into `ConverterWorkspace`.
  - Support `window.launchQueue` (PWA File Handling) to auto-ingest files opened from the OS desktop/file manager.

### 4.2 High-Throughput Batch UX, Mass Selector & Queue Virtualization
- **Immediate Mass Action Bar (`MassControlBar.tsx`):**
  - Automatically revealed above the queue whenever `shouldPromptMassSelection(jobs)` is true (`jobs.length > 10` OR nested folders exist), and toggleable anytime via toolbar.
  - Controls:
    1. **Folder Scope Pill Bar:** `All Folders (N)`, `Root`, plus each subfolder with counts & one-click filter (`getFolderSummaryList`).
    2. **Mass Format & Preset Selector:** Single click sets target format across scoped folder/category (`applyBulkTargetFormat`), applies built-in/custom **Pipeline Recipes** (*WebP 82% + Strip EXIF*, *Under 200 KB*, *HD 1080p Compress*, *Extract Text OCR*), or opens **Bulk Studio Settings** (`applyBulkSettings`).
    3. **Batch Rename Bar:** Inline pattern preset buttons (`{name}`, `{folder}_{name}_{index:3}`, `{date}_{index:4}`), prefix/suffix, live filename preview of item #1, applied via `resolveBatchOutputNames` for both individual downloads and `.zip`.
    4. **ZIP Structure Toggle:** Switch between **Preserve Subfolders** and **Flatten to Root** (`buildZipEntriesFromJobs`), with live `.zip` packing progress counter (`zipProgressPct`).
- **60fps Large Queue Rendering (`FileQueue.tsx`):**
  - Switch automatically to fixed-height virtualized windowing when `jobs.length > 30` (renders visible slice +/- 8 overscan rows inside a scrollable container, keeping DOM nodes <= ~35 even for 500 files).
  - `JobThumbnail.tsx` uses an `IntersectionObserver` + bounded active thumbnail bitmap cache so scrolling 200+ photos never decodes 200 full-res bitmaps simultaneously.

### 4.3 Off-Main-Thread Image Worker Pool & Smart Compression Studio
- **Image Worker (`src/lib/engines/imageWorker.ts` + `imageWorkerPool.ts`):**
  - Bounded pool (`min(navigator.hardwareConcurrency || 4, 6)` workers) executing `OffscreenCanvas` transforms inside Dedicated Workers (falling back automatically to `runConcurrentPool` on main thread if `OffscreenCanvas` or worker canvas context is unavailable, preserving Vitest/Node compatibility).
  - **Unified Image Transform Pipeline (`imageConverter.ts` + worker):**
    1. HEIC/HEIF decode via dynamic `heic2any`.
    2. Inspect EXIF orientation & metadata (`inspectImageMetadata`). Preserve lossless JPEG fast-path **only** when no edits (`crop`, `rotateDeg`, `flipH`, `flipV`, `watermark`, `targetSizeKb`, resize) and `orientation` is upright.
    3. Decode bitmap with `{ imageOrientation: "from-image" }`.
    4. Apply geometry pipeline cleanly in order: **Crop** (`px` or `%`) -> **Rotate** (`0/90/180/270`, swapping W/H at 90/270) -> **Flip H/V** -> **Resize / Max Bounds** (`calculateDimensions` + 256px cap for `ico`).
    5. Apply **Watermark Layer** (`text` or `imageDataUrl`, supporting `position`: corners / center / diagonal `tile`, `opacity`, `scale`, `color`).
    6. **Target-Size Auto-Compression (`targetSizeKb`):** When `targetSizeKb > 0` for lossy targets (`webp`, `jpeg`, `jpg`, `avif`), binary-search `quality` (`1..100`, max 7 iterations) until `blob.size <= targetSizeKb * 1024`. If minimum quality still exceeds `targetSizeKb * 1024`, step-down optional smart scale or return lowest valid output with `targetUnreachableWarning` surfaced visibly on the job row.
- **Smart Compression Dial UI (`CompressionStudioTab` in `SettingsModal.tsx`):**
  - Quality `10–100%` slider OR `Target KB` numeric preset (`100 KB`, `250 KB`, `500 KB`, `1 MB`, custom) with debounced (~180ms) live preview generation on a background canvas.
  - Real-time split comparison viewport + **Format Advisor** pill comparing actual encoded size at current quality across `WebP`, `JPEG`, and `AVIF` (when supported) with `<NumberFlow>` live byte readout.

### 4.4 Live Animated Telemetry (`SavingsTelemetry.tsx`) & Command Layer
- **Telemetry Cockpit:** Uses `@number-flow/react` across:
  - Batch Progress `%` + Completed/Total counts (`completedCount / totalCount`)
  - Throughput (`filesPerSec` files/s, `mbPerSec` MB/s) & Estimated Seconds Remaining
  - Cumulative Saved Bytes + Savings `%` (and `.zip` pack `%` when generating archives)
  - Respects `prefers-reduced-motion` (`respectMotionPreference={true}`).
- **Recipes & Command Palette (`CommandPalette.tsx`):**
  - `Ctrl+K` / `Cmd+K` palette with keyboard navigation for bulk actions, folder switching, format application, and applying custom `localStorage`-saved conversion recipes (anonymous, no account).

### 4.5 Video-to-GIF & Media Studio (`GifStudioModal.tsx` + `mediaConverter.ts`)
- Extend `buildFfmpegArgs` + `SettingsModal` / dedicated **GIF Studio Drawer** for video files targeting `gif` (or launched via `"Make GIF"` quick action):
  - **Timeline Range Selector:** Dual start/end scrubbers (`trimStart`, `trimEnd`) synced to `<video>` preview playback head.
  - **GIF Controls:** `fps` (`5`, `10`, `12`, `15`, `24`, `30`), output width preset (`320px`, `480px`, `640px`, `720px`, original), `gifLoop` (`0` = Infinite, `1`, `3`, `5`), **Reverse GIF (`reverseGif`)** boolean, and optional bottom/top **Caption Overlay (`gifCaption`)**.
  - **FFmpeg Filtergraph:** Builds deterministic 2-pass palette graph:
    `[trim] -> fps=${fps},scale=${w}:-1:flags=lanczos[,reverse][,caption],split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse` + `-loop ${gifLoop}`. For caption burn-in without relying on external system fonts inside WASM, pre-render caption strip cleanly or composite via canvas/PNG overlay `-i caption.png -filter_complex overlay`.
  - **Audio Trimming:** Ensure audio files cleanly expose `trimStart` / `trimEnd` + `<audio>` scrubber inside `SettingsModal.tsx` and map into `buildFfmpegArgs`.

### 4.6 Client-Side PDF Page Studio (`PdfStudioModal.tsx` + `documentConverter.ts`)
- Add `"pdf"` editorial/manipulation support when clicking **"Page Studio"** on any PDF job (keeping `"pdf"` out of invalid direct `documentConverter` raster export target while adding dedicated structural PDF workspace actions, plus **`"txt"` OCR target**):
  - Visual draggable/reorderable grid rendering low-res page thumbnails sequentially via `/pdfjs` (`page.cleanup()` enforced).
  - Per-page actions: **Rotate** (`+90°`), **Include/Exclude checkbox**, **Move Left/Right** (accessible keyboard alternative to drag).
  - Export modes using `pdf-lib` (`src/lib/converters/pdfTools.ts`):
    1. **Save Edited / Extracted PDF:** Copies selected/reordered pages and applies cumulative `setRotation(degrees(...))` cleanly.
    2. **Split PDF:** Outputs either **1 PDF per page** or **Custom Page Ranges** (`"1-3, 4-6"`) as multiple `OutputFile[]` entries bundled into `.zip`.
    3. **Merge Queued PDFs:** Combines multiple queued PDF files into one ordered PDF (`mergePdfDocuments(files)`).

### 4.7 Client-Side OCR Engine (`src/lib/engines/ocrEngine.ts` + `tesseract.js`)
- **Zero-Bloat Self-Hosted Setup:**
  - Install `tesseract.js` (`~6.x`) as the sole engine package for OCR; keep it **dynamically imported** inside `ocrEngine.ts` so landing JS budget stays untouched.
  - Extend `scripts/copy-wasm-assets.mjs` to copy Tesseract worker (`worker.min.js`), WASM core (`tesseract-core-simd-lstm.wasm.js` / `tesseract-core-lstm.wasm.js`), and starter English traineddata (`public/tesseract/eng.traineddata.gz`) into `public/tesseract/` so English OCR runs **100% same-origin, COEP-safe, and offline**. Additional languages load cleanly on demand from CORP-enabled `/tesseract` cache or CORS+CORP verified source and cache in Service Worker.
- **Image & Scanned PDF Integration:**
  - Add `"txt"` target format for `"image"` and `"document"` categories (and `"Extract Text (OCR)"` action button on queue rows).
  - For multi-page PDFs, rasterizes each page sequentially via `/pdfjs` (`scale: 2.0`), feeds image buffer to Tesseract worker, calls `page.cleanup()`, and produces structured `=== Page N ===` `.txt` output + copyable modal preview (`OcrResultModal.tsx`).

### 4.8 Offline-First PWA & OS Integration (`public/sw.js` + `src/app/manifest.ts`)
- **Custom Lightweight Service Worker (`public/sw.js` + `PwaRegistrar.tsx`):**
  - Avoids heavyweight Workbox build plugins. Registered lazily after first paint (`requestIdleCallback` / `load`).
  - **Install Budget (~0.5 MB shell only):** On `install`, precaches ONLY core app shell assets (never eagerly downloading the 32.2 MB `ffmpeg-core.wasm` or Tesseract packs on first visit).
  - **Lazy Runtime Caching + Explicit Offline Pack Button:** `/ffmpeg/*`, `/pdfjs/*`, and `/tesseract/*` cache **lazily on first use** (cache-first). A compact status button (**"Save Tools Offline"**) lets users opt in to pre-caching the full ~40 MB WASM/OCR bundle with a live percentage counter.
  - **COOP/COEP Header Preservation:** Clone/rebuild cached `Response` ensuring `Cross-Origin-Opener-Policy: same-origin` (documents), `Cross-Origin-Embedder-Policy: require-corp`, and `Cross-Origin-Resource-Policy: same-origin` so `SharedArrayBuffer` / FFmpeg WASM work reliably offline after install!
- **Enhanced `manifest.ts` & Launch Queue:**
  - Add `file_handlers` for images, video, audio, and PDFs + `share_target` (`/`) + crisp icon variants so installed desktop/Android PWAs accept **"Open with Pixshift"** directly from OS file managers.

### 4.9 Dual-Mode Anonymous Output Sharing (`src/lib/share/` + `ShareModal.tsx` + `/s/[id]`)
No accounts, no cookies, no user tracking, and designed within Vercel's **4.5 MB serverless body cap**:

- **Mode A — Zero-Server Instant Share (Always works with 0 backend storage):**
  1. **Native OS Share Sheet:** Calls `navigator.canShare({ files })` -> `navigator.share({ files, title })` for one-tap transfer to AirDrop/Nearby Share/Messages.
  2. **Serverless WebRTC P2P (`RTCDataChannel`) Drop:**
     - **Zero-server signaling:** Compresses WebRTC SDP Offer/Answer via Deflate (`CompressionStream`) + Base64url into copyable link/QR codes (`0` signaling database needed; also supports local `BroadcastChannel` for same-origin tabs).
     - **Privacy-first ICE default:** Defaults to `iceServers: []` (**strict LAN / same-Wi-Fi with zero third-party network traffic**). Provides an explicit opt-in checkbox (**"Enable cross-network STUN"** using `stun:stun.cloudflare.com:3478`) with transparent disclosure when sender is on Wi-Fi and recipient is on mobile data (TURN is out of scope).
- **Mode B — 24h Zero-Knowledge E2EE Share Link (Async sharing, `<= 25 MB`):**
  1. Browser generates random 256-bit `AES-GCM` key (`crypto.subtle.generateKey`) + 96-bit IV, encrypts `[4-byte metadata length][JSON metadata { name, mime, size }][file bytes]` locally into opaque ciphertext.
  2. **Bypassing Vercel's 4.5 MB Serverless Limit:**
     - Primary production store uses **Vercel Blob (`@vercel/blob`)** direct client-to-blob encrypted upload via short-lived upload tokens (`POST /api/share/token`, payload `<= 25 MB`), storing a lightweight metadata descriptor blob (`shares/<id>.meta.json` containing `blobUrl`, `expiresAt`, `burnAfterRead`, `byteSize`).
     - In local dev / Playwright CI when `BLOB_READ_WRITE_TOKEN` is unset, `src/lib/share/storage.ts` uses a bounded local temp-file E2EE store under `.next/cache/pixshift-shares` (respecting single-process E2E `next start`); in unconfigured production without `BLOB_READ_WRITE_TOKEN`, Mode B cleanly reports unavailable and keeps Mode A (OS Share + P2P) active.
  3. **TTL & Burn-After-Read:**
     - `GET /api/share/[id]` validates expiry (`expiresAt`); expired records are immediately deleted (`del`) and return `410 Gone`.
     - Ciphertext fetches bypass serverless limits via direct CORS/CORP-compliant Blob URL (`Access-Control-Allow-Origin` + same decryption flow). When `burnAfterRead` is set, client triggers `POST /api/share/[id]/consume` upon decrypt completion to delete both ciphertext and metadata blobs (or for `<= 4 MB`, `/api/share/[id]` returns ciphertext + deletes atomically if metadata marks `consumed`).
  4. **Zero-Knowledge Guarantee:** Decryption key stays strictly in the URL hash fragment:
     `https://pixyshift.vercel.app/s/<id>#k=<base64url-key>`
     Per HTTP spec, `#k=...` never leaves the browser. Recipient `/s/[id]/page.tsx` fetches encrypted bytes, decrypts client-side via Web Crypto API, and offers preview + instant download.

---

## 5. Verification Strategy

1. **Bundle Budget Gate:** `npm run build` MUST verify `/` First Load JS stays lightweight (`<= 135 kB`), confirming FFmpeg, PDF.js, pdf-lib, and Tesseract remain lazily chunked.
2. **Vitest Unit Suite (`tests/unit/`):**
   - Existing 12 suites + new suites covering:
     - Image geometry (`crop`, `rotateDeg`, `flipH`, `flipV`), watermark composition, and `targetSizeKb` binary-search convergence + unreachable warning.
     - PDF Studio operations (`mergePdfDocuments`, `splitPdfRanges`, `editPdfPages` reorder + cumulative rotation verified programmatically via `pdf-lib`).
     - FFmpeg GIF filtergraph builder (`fps`, `gifLoop`, `reverseGif`, trim bounds) & audio trim args.
     - Client-side E2EE share crypto (`encryptSharePayload` / `decryptSharePayload` round-trip, wrong-key rejection, malformed payload rejection) + QR encoder validity.
     - OCR text formatting & multi-page PDF chunking logic (with worker mock).
3. **Playwright E2E Suite (`tests/e2e/` against production `next start`):**
   - **Batch & Folder Upload:** 200-image nested folder (`batch-200`) drop/upload triggers immediate Mass Control Bar, folder scope filtering, batch rename pattern application, preserve-vs-flatten `.zip` inspection, windowed DOM check (DOM queue rows stay bounded even with 200 jobs), zero page/console errors, zero server uploads.
   - **Smart Compression & Edits:** Dial quality / Target-KB limit enforcement, rotation/crop output dimension checks, watermark pixel delta check, EXIF removal assertion.
   - **GIF Studio & Audio Trim:** Video → GIF (`fps`, `loop`, `reverse`) produces valid `GIF89a` output; audio trim produces shorter valid audio output.
   - **PDF Page Studio:** Reorder, rotate, split, merge 4-page PDF (`sample-4page.pdf`) verified by parsing downloaded PDF with `pdf-lib`.
   - **OCR (`tesseract.js`):** Synthetic clean-text PNG yields expected extracted `.txt` offline with zero external CDN requests under `COEP: require-corp`.
   - **PWA & Encrypted Share:** `/sw.js` serves cleanly preserving `COOP`/`COEP`, `manifest.webmanifest` includes `file_handlers`; E2EE Share generates `#k=` URL, recipient `/s/[id]#k=...` decrypts exact file bytes while network capture confirms server only received ciphertext and never received `#k`.
4. **Full CI Gate:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.
