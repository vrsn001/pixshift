# Pixshift v3 Modular Worker, Pro Studios, OCR, PWA & Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Pixshift into a lightweight (`<= 135 kB` initial JS), 60fps large-batch converter with off-main-thread image processing, live animated telemetry, Smart Compression Dial, Video-to-GIF Studio, PDF Page Studio, self-hosted Client-Side OCR, Offline PWA, and Dual-Mode Anonymous Output Sharing.

**Architecture:** Consolidate workspace logic onto `src/lib/converters/workspaceHelpers.ts` + a reducer-driven state hook (`useConverterWorkspace`), offload image transforms to a bounded `OffscreenCanvas` worker pool, render queues `>30` rows via windowed virtualization, and keep heavy engines (`ffmpeg`, `pdfjs`, `pdf-lib`, `tesseract.js`, E2EE share/P2P) strictly lazy-loaded and COEP-compliant under `/public/`.

**Tech Stack:** Next.js `15.5.29` App Router, React `19`, TypeScript `5.7+` (`strict`, `noUncheckedIndexedAccess`), Tailwind CSS `3.4.16`, `@number-flow/react`, `mediabunny`, `@ffmpeg/ffmpeg`, `pdfjs-dist`, `pdf-lib`, `jszip`, `heic2any`, `tesseract.js` (+ `@tesseract.js-data/eng`), `@vercel/blob`, Vitest `5`, Playwright Chromium.

**Spec:** [2026-11-27-pixshift-v3-architecture-design.md](file:///C:/Users/HP/Pixshift/docs/superpowers/specs/2026-11-27-pixshift-v3-architecture-design.md)

## Global Constraints

- **100% Anonymous & Zero-Login:** No accounts, cookies, user tracking, or third-party cloud OAuth imports.
- **Keep Landing Light (`<= 135 kB` First Load JS on `/`):** Never import FFmpeg, PDF.js, pdf-lib, Tesseract, or WebRTC share UI eagerly in the root shell.
- **Cross-Origin Isolation (`COOP: same-origin`, `COEP: require-corp`):** All worker scripts, WASM binaries, traineddata files, and Service Worker cached responses MUST be served same-origin with explicit CORP/COEP preservation.
- **Privacy Invariant:** Ordinary conversions and OCR MUST send zero network uploads; Mode A P2P defaults to `iceServers: []` (strict LAN) with opt-in STUN toggle; Mode B transmits only client-encrypted `AES-256-GCM` ciphertext (`<= 25 MB`) with decryption keys stored exclusively in URL `#fragment`.
- **Brand, Accessibility & Hygiene:** Brand strictly **Pixshift**, WCAG AA text contrast (`>= 4.5:1`), `prefers-reduced-motion`, TypeScript `strict: true` + `noUncheckedIndexedAccess: true`, ESLint 9 zero errors/warnings.

## Review Focus

- **OffscreenCanvas / Worker Unavailability (Node / restricted Chromium):** `imageWorkerPool` MUST detect missing `Worker` or `OffscreenCanvas` cleanly and fall back without crashing.
- **Unreachable `targetSizeKb` Limits (e.g., noisy PNG photo targeted at 1 KB):** Auto-compression binary search MUST bound iterations (`<= 7`), return the smallest valid image, and attach `targetUnreachableWarning` instead of looping endlessly or silently faking compliance.
- **Reversed / Out-of-Range PDF Split Expressions (e.g., `"5-2, 0, 99"` on a 4-page PDF):** `parsePageRanges` MUST throw a clear validation error or clamp predictably with explicit unit tests.
- **Video-to-GIF on Silent / Audio-less WebM Clips with Caption + Reverse:** FFmpeg filtergraph MUST avoid requiring system fonts or failing when input lacks audio streams.
- **Service Worker + Vercel `4.5 MB` Body Cap on E2EE Share:** Direct client upload + metadata routes MUST respect `4.5 MB` function limits, expire stale shares cleanly, and never lose `#k=` fragment on navigation or crash offline SW cache responses under COEP.

---

### Task 1: Workspace Architecture Consolidation, Folder Ingestion, Mass Control Bar, Virtual Queue & Animated Telemetry

**Files:**
- Delete duplicate: `src/components/converter/workspaceHelpers.ts`
- Modify: `src/lib/converters/workspaceHelpers.ts`, `src/lib/converters/registry.ts`, `src/types/converter.ts`
- Create: `src/lib/workspace/useConverterWorkspace.ts`, `src/lib/workspace/recipes.ts`, `src/components/converter/MassControlBar.tsx`, `src/components/converter/CommandPalette.tsx`
- Modify: `src/components/converter/DropZone.tsx`, `src/components/converter/FileQueue.tsx`, `src/components/converter/JobThumbnail.tsx`, `src/components/converter/ActionToolbar.tsx`, `src/components/converter/SavingsTelemetry.tsx`, `src/components/converter/ConverterWorkspace.tsx`
- Test: `tests/unit/workspaceLogic.test.ts`

**Interfaces:**
- Consumes: `extractDroppedFileEntries`, `normalizeInputFileEntries` (`src/lib/utils/folderDrop.ts`), `buildZipEntriesFromJobs`, `createZipArchive` (`src/lib/utils/archive.ts`), `resolveBatchOutputNames` (`src/lib/utils/rename.ts`), `runConcurrentPool`, `createBatchedUpdater` (`src/lib/utils/concurrency.ts`).
- Produces: `useConverterWorkspace()` hook returning `{ jobs, visibleJobs, folderSummaries, folderFilter, setFolderFilter, zipMode, setZipMode, renameSettings, setRenameSettings, showMassBar, telemetry, addEntries, applyMassFormat, applyRecipe, cancelBatch, ... }` plus unified `<MassControlBar />` and `<CommandPalette />`.

- [ ] **Step 1: Write unit tests for workspace recipes and batch filename preview helpers**
  Test `BUILT_IN_RECIPES` application with `applyBulkSettings`/`applyBulkTargetFormat`, folder scope filtering, and `zipMode` toggle state transitions in `tests/unit/workspaceLogic.test.ts`.
- [ ] **Step 2: Run Vitest to confirm failure on new recipe/helper exports**
  Run: `npm run test -- tests/unit/workspaceLogic.test.ts` (Expected: FAIL on missing exports).
- [ ] **Step 3: Consolidate `workspaceHelpers.ts`, build `recipes.ts` & `useConverterWorkspace.ts`**
  Delete `src/components/converter/workspaceHelpers.ts`; wire `DropZone` (`DroppedFileEntry[]`, `launchQueue` support), `useConverterWorkspace` (bounded `runConcurrentPool` + `createBatchedUpdater` + `AbortController` + deterministic `URL.revokeObjectURL` cleanup).
- [ ] **Step 4: Wire UI (`MassControlBar.tsx`, windowed `FileQueue.tsx`, lazy `JobThumbnail.tsx`, expanded `SavingsTelemetry.tsx`, `ActionToolbar.tsx`, `CommandPalette.tsx`)**
  - `MassControlBar`: auto-expanded on `shouldPromptMassSelection(jobs)`, folder filter pills, bulk format buttons, rename pattern presets (`{name}`, `{folder}_{name}_{index:3}`, `{date}_{index:4}`), live item #1 output name preview, and `zipMode` (`preserve` vs `flatten`).
  - `FileQueue`: windowed slice rendering when `jobs.length > 30` (48px-row container height tracking scroll position + 8 overscan rows) + `IntersectionObserver` thumbnail decode gating in `JobThumbnail.tsx`.
  - `SavingsTelemetry`: animate `overallProgressPct`, `completedCount`, `totalCount`, `filesPerSec`, `mbPerSec`, ETA seconds, `savedBytes`, `savedPercent`, and `zipProgressPct` via `@number-flow/react`.
- [ ] **Step 5: Run Vitest unit suite**
  Run: `npm run test` (Expected: PASS).
- [ ] **Step 6: Commit Task 1**
  Commit refactored workspace core, virtualized queue, mass selector, and telemetry.

---

### Task 2: Image Worker Pool, Geometry Edits, Watermarks & Smart Compression Dial Studio

**Files:**
- Modify: `src/types/converter.ts`, `src/lib/converters/imageConverter.ts`
- Create: `src/lib/engines/imageWorker.ts`, `src/lib/engines/imageWorkerPool.ts`
- Modify: `src/components/converter/SettingsModal.tsx`
- Test: `tests/unit/imageConverter.test.ts`

**Interfaces:**
- Consumes: `ConversionSettings` (`quality`, `targetSizeKb`, `crop`, `rotateDeg`, `flipH`, `flipV`, `watermark`, `stripExif`, `width`, `height`), `inspectImageMetadata`, `stripJpegBinaryMetadata`, `encodeBmpFromImageData`, `encodeIcoFromPngBytes`.
- Produces: `convertImageWithMeta(file, targetFormat, settings, onProgress)` returning `{ blob: Blob; targetUnreachableWarning?: string }` + `convertImageViaPool(...)` using `imageWorkerPool`.

- [ ] **Step 1: Write unit tests in `tests/unit/imageConverter.test.ts`**
  Add `test_convertImage_applies_rotate_flip_crop_dimensions`, `test_convertImage_binary_search_targetSizeKb_clamps_and_warns_when_unreachable`, and `test_convertImage_watermark_modifies_output_pixels`.
- [ ] **Step 2: Run Vitest to confirm failure**
  Run: `npm run test -- tests/unit/imageConverter.test.ts`
- [ ] **Step 3: Implement image transforms, watermark compositing, `targetSizeKb` binary search, and Worker Pool**
  Update `src/lib/converters/imageConverter.ts` with pure geometry + canvas watermark renderer + 7-iteration `targetSizeKb` binary search (`targetUnreachableWarning` when floor exceeds KB budget). Add Dedicated Worker wrapper (`src/lib/engines/imageWorker.ts`) + pool (`src/lib/engines/imageWorkerPool.ts`) with automatic main-thread fallback when `Worker`/`OffscreenCanvas` unavailable.
- [ ] **Step 4: Build Smart Compression Dial & Edit Studio inside `SettingsModal.tsx`**
  Add interactive Quality / Target-KB toggle & presets (`100 KB`, `250 KB`, `500 KB`, `1 MB`), debounced live preview comparing original vs compressed bytes with `NumberFlow` readout, Format Advisor (comparing WebP/JPEG/AVIF estimated output), Rotate (`0/90/180/270`), Flip H/V, Crop %/px inputs, and Text/Image Watermark controls.
- [ ] **Step 5: Run Vitest & Typecheck**
  Run: `npm run typecheck && npm run test` (Expected: PASS).
- [ ] **Step 6: Commit Task 2**

---

### Task 3: Video-to-GIF Studio & Audio Trim Controls

**Files:**
- Modify: `src/types/converter.ts`, `src/lib/converters/mediaConverter.ts`, `src/components/converter/SettingsModal.tsx`, `src/components/converter/FileQueue.tsx`
- Create: `src/components/converter/GifStudioModal.tsx`
- Test: `tests/unit/mediaConverter.test.ts`

**Interfaces:**
- Consumes: `transcodeMediaWithInfo`, `validateTrimRange`, `buildFfmpegArgs`.
- Produces: `buildFfmpegArgs` supporting `fps`, `gifLoop`, `reverseGif`, `width`, `trimStart`/`trimEnd`, plus `renderGifCaptionOverlayPng(caption, width)` for font-free FFmpeg WASM caption burn-in and `<GifStudioModal />`.

- [ ] **Step 1: Write unit tests in `tests/unit/mediaConverter.test.ts`**
  Verify `buildFfmpegArgs` for `gif` includes configured `fps`, `-loop`, `reverse` filter when `reverseGif: true`, custom scale width, trim flags, and audio trim flags cleanly.
- [ ] **Step 2: Run Vitest to confirm failure**
  Run: `npm run test -- tests/unit/mediaConverter.test.ts`
- [ ] **Step 3: Extend `ConversionSettings` (`reverseGif`, `gifCaption`) & `mediaConverter.ts`**
  Update `buildFfmpegArgs` + `transcodeWithFfmpeg` (writing optional caption overlay PNG to MEMFS when `gifCaption` is non-empty and compositing `[0:v]` + `[1:v]overlay` before palettegen).
- [ ] **Step 4: Build `GifStudioModal.tsx` & wire Audio Trim UI in `SettingsModal.tsx`**
  Provide timeline start/end scrubber synced to `<video>` preview, FPS (`5/10/12/15/24/30`), width (`320/480/640/720`), loop count, Reverse toggle, Caption text input, and inline generated GIF preview. Expose `<audio>` duration & `trimStart`/`trimEnd` for audio jobs in `SettingsModal.tsx`.
- [ ] **Step 5: Run Vitest & Typecheck**
  Run: `npm run typecheck && npm run test` (Expected: PASS).
- [ ] **Step 6: Commit Task 3**

---

### Task 4: Visual Client-Side PDF Page Studio (Reorder, Rotate, Split/Extract, Merge)

**Files:**
- Create: `src/lib/converters/pdfTools.ts`, `src/components/converter/PdfStudioModal.tsx`
- Modify: `src/components/converter/FileQueue.tsx`, `src/components/converter/ActionToolbar.tsx`
- Test: `tests/unit/documentConverter.test.ts`

**Interfaces:**
- Consumes: `pdf-lib`, self-hosted `/pdfjs/pdf.worker.min.mjs`.
- Produces: `parsePageRanges(expr: string, totalPages: number): number[][]`, `editPdfPages(file, ops: PdfPageOp[]): Promise<Blob>`, `splitPdfByRanges(file, rangesExpr: string): Promise<{ name: string; blob: Blob }[]>`, `mergePdfDocuments(files: File[]): Promise<Blob>`, and `<PdfStudioModal />`.

- [ ] **Step 1: Write failing unit tests in `tests/unit/documentConverter.test.ts`**
  Using `pdf-lib` on synthetic `sample-4page.pdf` (in memory or fixture): test `parsePageRanges("1-2, 4", 4)` -> `[[0,1],[3]]`, invalid/reversed `"5-2, 99"` throwing clear error, `editPdfPages` reordering `[3, 0]` + rotating page `90°`, `splitPdfByRanges`, and `mergePdfDocuments` preserving exact page count & rotations.
- [ ] **Step 2: Run Vitest to confirm failure**
  Run: `npm run test -- tests/unit/documentConverter.test.ts`
- [ ] **Step 3: Implement `src/lib/converters/pdfTools.ts`**
  Sequential thumbnail rendering (`page.cleanup()` + `pdf.destroy()` in `finally`), validated `parsePageRanges`, `editPdfPages` (`degrees`), `splitPdfByRanges`, and `mergePdfDocuments`.
- [ ] **Step 4: Build `PdfStudioModal.tsx` & wire into `FileQueue` + `ActionToolbar`**
  Show visual page cards with accessible keyboard Move Left / Right, Rotate `+90°`, Include toggle, Split Range input, Extract All to separate PDFs button, and multi-PDF Merge trigger in `ActionToolbar`.
- [ ] **Step 5: Run Vitest & Typecheck**
  Run: `npm run typecheck && npm run test` (Expected: PASS).
- [ ] **Step 6: Commit Task 4**

---

### Task 5: Self-Hosted Client-Side OCR Engine (`tesseract.js`)

**Files:**
- Modify: `package.json`, `scripts/copy-wasm-assets.mjs`, `eslint.config.mjs`, `src/lib/converters/registry.ts`, `src/types/converter.ts`
- Create: `src/lib/engines/ocrEngine.ts`, `src/components/converter/OcrResultModal.tsx`
- Modify: `src/lib/workspace/useConverterWorkspace.ts`, `src/components/converter/FileQueue.tsx`
- Test: `tests/unit/ocrEngine.test.ts`

**Interfaces:**
- Consumes: `tesseract.js`, `@tesseract.js-data/eng`, `/tesseract/*` self-hosted assets.
- Produces: `AVAILABLE_TARGETS.image` & `AVAILABLE_TARGETS.document` include `"txt"`; `extractTextWithOcr(file, category, options, onProgress): Promise<{ text: string; confidence?: number; pages: number }>`.

- [ ] **Step 1: Install `tesseract.js` + `@tesseract.js-data/eng` (and `@vercel/blob` for Task 7), extend `copy-wasm-assets.mjs`**
  Copy Tesseract worker, WASM core, and `eng.traineddata.gz` into `public/tesseract/`; add `"public/tesseract/**"` to `eslint.config.mjs` ignores.
- [ ] **Step 2: Write unit tests in `tests/unit/ocrEngine.test.ts`**
  Mock `tesseract.js` `createWorker`; test image OCR path uses self-hosted `/tesseract/...` URLs (zero `cdn`/`jsdelivr` URLs), and multi-page formatting (`=== Page 1 ===`).
- [ ] **Step 3: Run Vitest to confirm failure**
  Run: `npm run test -- tests/unit/ocrEngine.test.ts`
- [ ] **Step 4: Implement `ocrEngine.ts`, `"txt"` target routing, and `OcrResultModal.tsx`**
  Dynamically import `tesseract.js`, terminate worker cleanly in `finally`, process PDF pages sequentially via `/pdfjs` when `category === "document"`, return `.txt` `OutputFile`, and allow one-click Copy / Preview in `OcrResultModal.tsx`.
- [ ] **Step 5: Run Vitest & Typecheck**
  Run: `npm run typecheck && npm run test` (Expected: PASS).
- [ ] **Step 6: Commit Task 5**

---

### Task 6: Offline-First PWA (`public/sw.js`), File Handlers & OS Share Target

**Files:**
- Modify: `src/app/manifest.ts`, `src/app/layout.tsx`, `src/components/Header.tsx`
- Create: `public/sw.js`, `src/components/PwaRegistrar.tsx`
- Test: `tests/unit/manifest.test.ts`

**Interfaces:**
- Consumes: `next.config.ts` header rules (`COOP: same-origin`, `COEP: require-corp`).
- Produces: `manifest()` exporting valid `file_handlers` & `share_target`; `/sw.js` preserving COOP/COEP/CORP headers on cached responses + `prewarmOfflinePack(onProgress)`.

- [ ] **Step 1: Write unit test in `tests/unit/manifest.test.ts`**
  Assert `manifest()` returns `display: "standalone"`, non-empty `file_handlers` covering `image/*`, `video/*`, `audio/*`, `application/pdf`, and valid `share_target`.
- [ ] **Step 2: Run Vitest to confirm failure**
  Run: `npm run test -- tests/unit/manifest.test.ts`
- [ ] **Step 3: Implement `public/sw.js`, update `src/app/manifest.ts`, and create `PwaRegistrar.tsx`**
  Ensure `sw.js` precaches only lightweight shell routes on `install`, lazily caches `/ffmpeg/*`, `/pdfjs/*`, `/tesseract/*` on `fetch`, always injects `Cross-Origin-Embedder-Policy: require-corp` & `Cross-Origin-Resource-Policy: same-origin` headers onto cloned responses, and adds an opt-in **"Offline Pack"** button in Header.
- [ ] **Step 4: Run Vitest & Typecheck**
  Run: `npm run typecheck && npm run test` (Expected: PASS).
- [ ] **Step 5: Commit Task 6**

---

### Task 7: Dual-Mode Anonymous Output Sharing (OS Share + QR WebRTC P2P + AES-256-GCM 24h Vault)

**Files:**
- Create: `src/lib/share/crypto.ts`, `src/lib/share/qr.ts`, `src/lib/share/p2p.ts`, `src/lib/share/storage.ts`, `src/app/api/share/capabilities/route.ts`, `src/app/api/share/token/route.ts`, `src/app/api/share/route.ts`, `src/app/api/share/[id]/route.ts`, `src/app/api/share/[id]/consume/route.ts`, `src/components/converter/ShareModal.tsx`, `src/app/s/[id]/page.tsx`
- Modify: `src/components/converter/FileQueue.tsx`
- Test: `tests/unit/share.test.ts`

**Interfaces:**
- Consumes: Web Crypto API (`crypto.subtle`), `CompressionStream`, `@vercel/blob` (optional `BLOB_READ_WRITE_TOKEN`).
- Produces: `encryptSharePayload(fileBytes, meta)`, `decryptSharePayload(cipherBytes, base64Key)`, `encodeQrSvg(text)`, compressed WebRTC SDP helpers (`iceServers: []` default + optional STUN), `<ShareModal />`, and `/s/[id]` recipient page.

- [ ] **Step 1: Write failing unit tests in `tests/unit/share.test.ts`**
  Test `encryptSharePayload` / `decryptSharePayload` round-trip (`filename`, `mime`, exact bytes), tampered ciphertext / wrong `#k=` rejection, `encodeQrSvg` generating valid `<svg` matrix, and `25 MB` payload limit enforcement in storage validation.
- [ ] **Step 2: Run Vitest to confirm failure**
  Run: `npm run test -- tests/unit/share.test.ts`
- [ ] **Step 3: Implement crypto, pure-TS QR matrix SVG encoder, P2P WebRTC module & hybrid storage adapter**
  - Mode A P2P uses compressed SDP Offer/Answer strings + `BroadcastChannel` local fast-path + optional STUN toggle (`iceServers: []` by default).
  - Mode B uses `@vercel/blob` client-direct upload (`/api/share/token`) + `shares/<id>.meta.json` when `BLOB_READ_WRITE_TOKEN` is set, or bounded `.next/cache/pixshift-shares` ephemeral disk store in local/Playwright test runs.
- [ ] **Step 4: Build `/api/share/*`, `<ShareModal />`, `/s/[id]/page.tsx` & wire Share button on done jobs**
  Ensure `#k=` fragment is strictly generated and parsed client-side and never included in API calls.
- [ ] **Step 5: Run Vitest & Typecheck**
  Run: `npm run typecheck && npm run test` (Expected: PASS).
- [ ] **Step 6: Commit Task 7**

---

### Task 8: Full Playwright E2E Verification, Bundle Budget Audit, Git Push & Live Deployment

**Files:**
- Create: `tests/e2e/v3-batch-and-studios.spec.ts`
- Modify: `tests/e2e/helpers.ts`, `README.md`

- [ ] **Step 1: Write comprehensive Playwright E2E tests (`tests/e2e/v3-batch-and-studios.spec.ts`)**
  Test against production `next build && next start`:
  1. 200-image nested folder (`batch-200`) upload -> auto Mass Control Bar -> folder filter -> batch rename -> `.zip` preserve vs flatten entry verification -> windowed DOM bounding -> zero console/page errors -> zero external uploads.
  2. Live NumberFlow telemetry counters updating across conversion.
  3. Target-size KB compression + rotate/crop + watermark pixel verification + EXIF strip verification.
  4. GIF Studio (`fps`, `loop`, `reverse`) outputting valid `GIF89a`.
  5. PDF Page Studio (`sample-4page.pdf`) reorder/rotate/split/merge parsed back via `pdf-lib`.
  6. Offline-safe OCR producing extracted text with zero CDN requests.
  7. Service Worker (`sw.js`) & `manifest.webmanifest` checks + E2EE Share Link round-trip verifying `#k=` fragment never appears in HTTP requests.
- [ ] **Step 2: Run complete verification suite**
  Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`
  Verify `/` First Load JS stays `<= 135 kB` and every unit + E2E spec passes cleanly.
- [ ] **Step 3: Update `README.md`, commit, push to `origin/main` & deploy to Vercel**
  Tag/push verified release and verify live `https://pixyshift.vercel.app` HTTP 200.

---

## Self-Review Checklist
- Covers every requirement in `2026-11-27-pixshift-v3-architecture-design.md` (batch/folder wiring, virtualization, image worker pool, compression dial + edits + watermarks, live telemetry, recipes + Ctrl+K, GIF studio + audio trim, PDF studio, self-hosted OCR, PWA + file handlers, Mode A P2P/OS share + Mode B E2EE share).
- Zero undefined interfaces or contradictory signatures across Tasks 1–8.
- All 5 Review Focus failure modes pinned to explicit unit/E2E tests.
