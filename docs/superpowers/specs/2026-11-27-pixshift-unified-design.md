# Pixshift Unified Specification — Phase 1 Stabilization & Phase 2 Instrument Rebuild

**Date:** 2026-11-27  
**Project:** Pixshift (`C:\Users\HP\Pixshift`)  
**Repository:** `https://github.com/vrsn001/pixshift` (`main`, base `2d589a8`)  
**Deployment Target:** Vercel (`pixyshift` / `prj_k1PSCy3JyYKrMnCxMMUAxcqFZJPA`, `https://pixyshift.vercel.app`)  
**Supersedes / Extends:** `docs/superpowers/specs/2026-11-21-pixshift-rebuild-design.md`  
**Status:** Approved for Implementation Planning

---

## 1. Intent and Why

Pixshift (`2d589a8`) established a Next.js 15 client-side media conversion shell, but audit of the codebase revealed critical functional defects (PNG bytes exported as `.pdf`, `.bmp`, `.ico`, and `.avif`; stale `mergeToPdf` state stranding lone images; invalid `document → pdf` routing; unknown files silently falling back to `image/webp`; cross-origin `unpkg.com` fetches under `COEP: require-corp`; unrevoked `Blob` URLs, simultaneous `createImageBitmap` allocations, missing `page.cleanup()`, and silent `.zip` overwrites), brand drift (`Pixyshift` vs `Pixshift`), WCAG AA contrast failures (`#5a5952` at `2.52:1–2.81:1`), interactive accessibility gaps, broken SVG social metadata, and zero automated test/lint/CI gates.

This unified specification defines both:
- **Phase 1 (Stabilization, Self-Hosting, Brand/A11y/SEO & CI Gate):** Fix all 7 conversion/resource bugs, unify the **Pixshift** brand and copy, add `1200×630` OpenGraph image generation, achieve WCAG AA contrast and keyboard/dialog accessibility, clean up CSS/Tailwind tokens, enable TypeScript `noUncheckedIndexedAccess`, and establish ESLint 9 + Vitest + Playwright + GitHub Actions CI.
- **Phase 2 (Feature & Instrument UI Rebuild):** Deliver the Before/After Visual Diff Slider, NumberFlow Size Savings Telemetry, hardware-accelerated Mediabunny/WebCodecs video trim & compression (with self-hosted FFmpeg WASM fallback), EXIF metadata detection & stripping, custom W/H + aspect lock + 10 legacy resolution presets + queue thumbnails + `webkitdirectory` folder drop, and a cohesive Teenage Engineering / Cobalt acid instrument UI.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Correct, Honest Client-Side Conversions:** Every supported target format outputs real, spec-compliant binary headers (`%PDF-`, `BM`, `00 00 01 00`, valid WebP/PNG/JPEG, real AVIF or explicit capability error) — never mislabeled PNG bytes.
- **Zero External Runtime Dependencies Under COEP:** Self-host `@ffmpeg/core` (`0.12.10`) and `pdfjs-dist` (`4.10.38`) worker assets in `public/` with a reproducible copy script so runtime execution makes zero requests to `unpkg.com`.
- **Leak-Free Memory & Archive Lifecycle:** Revoke all created `ObjectURL`s on removal, clear, re-conversion, and unmount; decode PDF/image bitmaps sequentially with deterministic disposal; deduplicate filenames inside `.zip` exports.
- **Accessible, Brand-Consistent Foundation:** Unify visible branding on **Pixshift**, apply exact Hero/Feature copy, ship a `1200×630` PNG OpenGraph image, enforce `>= 4.5:1` WCAG AA text contrast, full keyboard/dialog ARIA semantics, and `prefers-reduced-motion` support.
- **Automated Quality Gate:** Enforce `noUncheckedIndexedAccess: true`, zero `any` in `mediaConverter.ts`, ESLint 9, Vitest unit tests, Playwright E2E tests with synthetic fixtures, and GitHub Actions CI.
- **Precision Media Instrument (Phase 2):** Add Visual Diff Slider, `@number-flow/react` byte/percent telemetry, Mediabunny/WebCodecs video trim & compression with FFmpeg fallback, EXIF detection & stripping, custom W/H + 10 legacy presets, thumbnails, folder drop, and Teenage Engineering / Cobalt acid UI polish.

### Non-Goals
- Server-side transcoding, user accounts, cloud storage, or persistent conversion history.
- Proprietary office document rendering (DOCX/XLSX/PPTX) or multi-frame `.ico` sprite generation beyond a single-entry `<=256×256` icon.
- Bundling a multi-megabyte client-side AV1/AVIF software encoder WASM inside Phase 1 when native Canvas capability probing + explicit unsupported handling satisfies safety without webpack WASM churn.

### Anti-Goals
- **Silent Format Mislabeling:** Never emit PNG bytes with `.pdf`, `.bmp`, `.ico`, or `.avif` filenames or MIME types.
- **Silent Unknown-File Coercion:** Never pretend an unknown `.txt`/`.exe`/`.zip` file is a valid `image → webp` conversion job.
- **External CDN Runtime Fetches:** Never call `unpkg.com` or external CDNs at runtime under `COEP: require-corp`.
- **Visual Fluff Over Function:** No ungrounded decorative blurs (`blur(90px)` blobs) or low-contrast chrome (`#5a5952`) that degrade legibility or GPU performance.

---

## 3. Hard Constraints

1. **Runtime Environment:** 100% browser-only execution; zero server uploads; Vercel Hobby static/SSR compatible.
2. **Cross-Origin Isolation (`next.config.ts` & `vercel.json`):** `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` apply to `/(.*)`. All worker scripts and WASM binaries MUST be served same-origin from `public/` (or carry CORP).
3. **Platform & Stack Versions:**
   - Node.js `v24.19.0`, Next.js `15.5.29` (App Router), React `19`, TypeScript `5.7+` with `"strict": true` and `"noUncheckedIndexedAccess": true`.
   - Tailwind CSS `v3.4.16` (`tailwind.config.ts` + `postcss.config.mjs` — do NOT use Tailwind v4 `@theme` syntax).
   - ESLint `9` pinned to `eslint@^9.39.5` + `eslint-config-next@15.5.29` (because `eslint@10` violates `eslint-config-next@15.5.29` peerDependencies).
4. **Deployment Coordinates:**
   - GitHub remote: `https://github.com/vrsn001/pixshift` (`main`).
   - Vercel project: `pixyshift` (`prj_k1PSCy3JyYKrMnCxMMUAxcqFZJPA`, live host `https://pixyshift.vercel.app`). Note: the Vercel subdomain/project slug `pixyshift` and canonical URL `https://pixyshift.vercel.app` are intentional infrastructure coordinates and remain unchanged.

---

## 4. Evaluated Approaches & Architectural Decisions

### (a) AVIF Encoding & Fallback Strategy (`imageConverter.ts`, `FormatSelector.tsx`)
- **Problem:** `OffscreenCanvas.convertToBlob({ type: "image/avif" })` is supported in modern Chromium, but Safari/older browsers/software renderers may lack native AVIF encoding and either throw `EncodingError` or silently return a `Blob` with `type: "image/png"`.
- **Evaluated Approaches:**
  1. **Option A — Strict Capability-Gated Native Canvas + Explicit Unsupported Error (SELECTED):**
     - Add `supportsAvifEncoding(): Promise<boolean>` (memoized 1×1 `OffscreenCanvas`/`HTMLCanvasElement` probe checking `blob.type === "image/avif"`).
     - Inside `convertImage`, after encoding `avif`, assert `resultBlob.type === "image/avif"`. If the browser throws OR returns `image/png` (or any non-`image/avif` type), throw an explicit error: `"AVIF encoding is not supported in this browser. Select WebP or JPEG instead."` — **never** emit PNG bytes as `.avif`.
     - Expose `supportsAvif` in `FormatSelector` so unsupported browsers disable/badge the AVIF option clearly (`"Unsupported in browser"`).
  2. **Option B — Lazy `@jsquash/avif` WASM Fallback:**
     - Bundle/serve `@jsquash/avif` (`2.1.1`) when native encoding fails.
     - *Tradeoff & Rejection Rationale:* `@jsquash/avif` ships ~1.8 MB of Emscripten WASM + worker glue using `import.meta.url` that requires custom Next 15 webpack `asyncWebAssembly` / asset configuration and CORP-compatible worker loading. Given the explicit acceptance criterion (`"non-PNG AVIF behavior (or explicit unsupported handling)"`), Option A guarantees zero silent PNG corruption, zero webpack WASM instability under COEP, small bundle size, and deterministic testing in both Vitest and Playwright.

### (b) Pure-TS BMP & ICO Binary Encoders (`src/lib/converters/encoders.ts` + `imageConverter.ts`)
- **Problem:** Browsers do not encode `image/bmp` or `image/x-icon` in `canvas.toBlob` / `toDataURL`, silently falling back to `image/png`.
- **Decision:** Extract dedicated, pure-TypeScript binary encoders in `src/lib/converters/encoders.ts` (easily unit-tested in Node/Vitest without DOM canvas encoding dependencies):
  - **`encodeBmpFromImageData(imageData: ImageData): Blob`:**
    - Composites alpha onto white (`#ffffff`) background (matching `imageConverter.ts` opaque RGB convention) and writes a standard 24-bit `BI_RGB` bottom-up Windows Bitmap:
      - 14-byte `BITMAPFILEHEADER`: signature `0x42, 0x4D` (`"BM"`), total file size (`54 + pixelDataSize`), reserved `0`, pixel offset `54`.
      - 40-byte `BITMAPINFOHEADER`: `biSize=40`, `biWidth=width`, `biHeight=height` (positive = bottom-up for universal viewer compatibility), `biPlanes=1`, `biBitCount=24`, `biCompression=0`, `biSizeImage=pixelDataSize`.
      - BGR pixel rows padded to 4-byte boundary (`rowStride = (width * 3 + 3) & ~3`).
      - Returns `new Blob([buffer], { type: "image/bmp" })`.
  - **`encodeIcoFromPngBytes(pngBytes: Uint8Array, width: number, height: number): Blob`:**
    - Validates `1 <= width <= 256` and `1 <= height <= 256` (in `imageConverter.ts`, if `Math.max(width, height) > 256`, scales dimensions proportionally to fit within `256×256` before rendering to canvas).
    - Writes 6-byte `ICONDIR`: `0x00 0x00` (reserved), `0x01 0x00` (type = 1 icon), `0x01 0x00` (count = 1).
    - Writes 16-byte `ICONDIRENTRY`: `bWidth = width === 256 ? 0 : width`, `bHeight = height === 256 ? 0 : height`, `bColorCount = 0`, `bReserved = 0`, `wPlanes = 1`, `wBitCount = 32`, `dwBytesInRes = pngBytes.byteLength`, `dwImageOffset = 22`.
    - Appends `pngBytes` directly after the 22-byte header (standard Vista+ PNG-in-ICO format supported natively by Windows, macOS, and all browsers).
    - Returns `new Blob([buffer], { type: "image/x-icon" })`.

### (c) Image→PDF Single-File, `mergeToPdf` State Invariant, Document Routing & Unsupported Files
1. **Single Image → PDF (`ConverterWorkspace.tsx`):**
   - `AVAILABLE_TARGETS.image` retains `"pdf"`.
   - When `job.category === "image" && job.targetFormat === "pdf"` and the job is NOT part of a `>= 2` merged PDF batch, `processJob` invokes `mergeImagesToPdf([job.file], onProgress)` instead of `convertImage(...)`, producing a genuine `%PDF-` document named `${baseName}.pdf`.
2. **`mergeToPdf` State Invariant (`ConverterWorkspace.tsx`, `ActionToolbar.tsx`):**
   - Define `countImagePdfTargets(jobs: ConversionJob[]): number` counting jobs where `category === "image" && targetFormat === "pdf"` (pending/error/done-eligible check: specifically `jobs.filter((j) => j.category === "image" && j.targetFormat === "pdf").length` for toolbar visibility, and in `handleConvertAll` merge only when `mergeToPdf && imagePdfJobs.length >= 2`).
   - Whenever `handleRemoveJob`, `handleUpdateFormat`, or `handleClearAll` reduces `imagesToPdfCount < 2`, immediately reset `setMergeToPdf(false)`.
   - Additionally, in `handleConvertAll`, compute `const shouldMergePdf = mergeToPdf && imagePdfJobs.length >= 2;` so `imageJobs` only excludes `j.targetFormat === "pdf"` when `shouldMergePdf` is `true` — making it mathematically impossible for a lone image→pdf job to remain stranded in `"pending"`.
3. **Remove `document → pdf` Routing (`registry.ts`, `documentConverter.ts`, `ConverterWorkspace.tsx`):**
   - Change `AVAILABLE_TARGETS.document` in `src/lib/converters/registry.ts` from `["png", "jpeg", "pdf"]` to `["png", "jpeg"]`.
   - In `ConverterWorkspace.tsx` & `extractPdfToImages`, guard `targetFormat`: if `targetFormat !== "png" && targetFormat !== "jpeg"`, throw `new Error("Unsupported document target format: ...")`.
4. **Explicit Unsupported-File Union (`detector.ts`, `ConverterWorkspace.tsx`):**
   - Replace the permissive return type of `detectFileInfo(file: File)` with a discriminated union:
     ```ts
     export type FileDetectionResult =
       | {
           supported: true;
           category: FileCategory;
           inputFormat: string;
           defaultTarget: SupportedFormat;
         }
       | {
           supported: false;
           inputFormat: string;
           reason: string;
         };
     ```
   - Remove the generic fallback returning `{ category: "image", defaultTarget: "webp" }`. If neither `EXTENSION_MAP[ext]` nor a recognized `file.type` (`image/*`, `video/*`, `audio/*`, `application/pdf` — excluding non-convertible `image/x-portable-*` or unknown MIME if desired, while keeping standard `image/`, `video/`, `audio/`, `application/pdf`) matches, return `{ supported: false, inputFormat: ext || "unknown", reason: \`Unsupported file type: \${file.name}\` }`.
   - In `ConverterWorkspace.tsx`, partition incoming `files` via `detectFileInfo`: queue only `supported: true` files and store rejected filenames/reasons in `rejectedFiles: string[]`, rendered as a dismissible `role="alert"` banner above the queue (`"Unsupported file(s) skipped: ..."`).

### (d) Self-Hosted `@ffmpeg/core` and `pdfjs-dist` Worker Assets
- **Problem:** `mediaConverter.ts:32` fetches from `https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm` and `documentConverter.ts:75` fetches from `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`, violating `COEP: require-corp` and offline/privacy guarantees.
- **Decision:**
  1. Add `"@ffmpeg/core": "0.12.10"` to `dependencies` in `package.json`.
  2. Create `scripts/copy-wasm-assets.mjs` (idempotent Node script) that copies:
     - `node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js` → `public/ffmpeg/ffmpeg-core.js`
     - `node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm` → `public/ffmpeg/ffmpeg-core.wasm`
     - `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` → `public/pdfjs/pdf.worker.min.mjs`
  3. Wire `"sync-assets": "node scripts/copy-wasm-assets.mjs"`, `"postinstall": "npm run sync-assets"`, and `"prebuild": "npm run sync-assets"` in `package.json`, and commit the copied files in `public/` so static deployments work immediately.
  4. Update `mediaConverter.ts` to load `/ffmpeg/ffmpeg-core.js` and `/ffmpeg/ffmpeg-core.wasm` via `toBlobURL` (using `window.location.origin` or relative `/ffmpeg/...` — note: `@ffmpeg/ffmpeg`'s internal module worker runs `await import(_coreURL)`, and `toBlobURL` fetches same-origin `/ffmpeg/ffmpeg-core.js` cleanly under COEP).
  5. Update `documentConverter.ts` to set `pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"`.

### (e) Blob URL Lifecycle, Sequential Decoding, PDF Cleanup & Zip Deduplication
1. **Blob URL Lifecycle (`ConverterWorkspace.tsx`, `JobThumbnail.tsx`, `VisualDiffModal.tsx`):**
   - Helper `revokeJobUrls(job: ConversionJob)`: iterates `job.outputFiles` and calls `URL.revokeObjectURL(out.url)`.
   - Maintain `activeOutputUrlsRef = useRef<Set<string>>(new Set())` (or revoke directly inside `handleRemoveJob`, `handleClearAll`, before overwriting `outputFiles` on re-conversion in `handleUpdateFormat`/`processJob`, AND on `ConverterWorkspace` unmount `useEffect(() => () => activeOutputUrlsRef.current.forEach(URL.revokeObjectURL), [])`).
   - `FileQueue.tsx` download triggers `triggerDownload(out.blob, out.name)` or `<a href={out.url} download={out.name}>` without leaking unrevoked URLs. (Keeping `triggerDownload` revoking its ephemeral URL after 2000ms AND revoking `OutputFile.url` on remove/clear/reconvert/unmount guarantees zero leaks).
2. **Sequential `createImageBitmap` + HEIC + `page.cleanup()` (`documentConverter.ts`):**
   - In `mergeImagesToPdf(files, onProgress)`: remove `Promise.all(files.map(createImageBitmap))`. Inside the `for (let i = 0; i < total; i++)` loop, preprocess HEIC if needed, embed PNG/JPEG directly or decode a single `bitmap = await createImageBitmap(sourceBlob)` inside `try { ... } finally { bitmap.close(); }`, and reject `canvas.toBlob` cleanly if `b === null`.
   - In `extractPdfToImages(file, targetFormat, onProgress)`: wrap `const pdf = await loadingTask.promise` in `try { ... } finally { await pdf.destroy(); }`, and wrap each `page` inside `try { ... } finally { page.cleanup(); }`. Reject `canvas.toBlob` cleanly if `b === null`.
3. **Zip Filename Deduplication (`src/lib/utils/archive.ts`):**
   - Add exported helper `deduplicateArchivePath(name: string, folder: string | undefined, usedPaths: Set<string>): string`:
     - Compute full key `folder ? \`\${folder}/\${name}\` : name`.
     - If unused, add to `usedPaths` and return `name`.
     - Otherwise split `base` and `ext` (preserving multi-char extension after last `.`, or appending suffix if none) and try `${base} (${counter})${extWithDot}` until unused, register in `usedPaths`, and return deduplicated `name`.

### (f) Brand Unification, Exact Copy, `opengraph-image.tsx`, WCAG AA, A11y & CSS Hygiene
1. **Brand Unification (`Header.tsx`, `Footer.tsx`, `public/logo.svg`, `README.md`):**
   - Replace `Pixyshift` → `Pixshift` in `Header.tsx:19`, `Footer.tsx:12`, and `public/logo.svg:15` (remove stale `v2.0` pill from `logo.svg` if cleaner, or update cleanly).
   - Update `README.md` to remove `"Obsidian/Slate dark glassmorphic theme"` and `"CloudConvert-Style Workflow"`, document Phase 1 + Phase 2 capabilities, self-hosted WASM sync, and testing commands, while keeping `https://pixyshift.vercel.app` / `pixyshift` Vercel deployment metadata.
2. **Exact R3 Landing Copy (`src/app/page.tsx`):**
   - **Hero Badge:** `Runs in your browser`
   - **Hero Headline:** `Convert images, video, audio, and PDFs **on your device.**` (rendered with `<em className="not-italic text-[#c8f03c] ...">on your device.</em>` — exact text: `Convert images, video, audio, and PDFs on your device.`)
   - **Hero Subhead:** `Drop media below to convert between WebP, AVIF, MP4, MP3, GIF, and PDF. Nothing gets uploaded because your browser does the work.`
   - **Feature Card Titles (3 cards):**
     1. `Your files stay on your disk`
     2. `Batch queues with real controls`
     3. `Pay for nothing`
3. **Social Metadata (`src/app/opengraph-image.tsx`, `src/app/layout.tsx`):**
   - Create `src/app/opengraph-image.tsx` exporting `size = { width: 1200, height: 630 }`, `contentType = "image/png"`, `alt = "Pixshift — Client-Side Media & Document Converter"`, rendering a crisp Teenage Engineering / Cobalt & Acid Lime branded card via `ImageResponse` from `next/og` using built-in/local styling only (zero external font `fetch()` calls at build or request time under offline CI / `COEP: require-corp`).
   - Remove the broken `/logo.svg` entries from `openGraph.images` and `twitter.images` in `src/app/layout.tsx` (Next.js App Router automatically wires `/opengraph-image` for both `og:image` and `twitter:image` when `opengraph-image.tsx` exists; optionally also add `src/app/twitter-image.tsx` re-exporting `opengraph-image.tsx`).
4. **WCAG AA Color Tokens (`globals.css`, `tailwind.config.ts`, components):**
   - Replace all 9 `#5a5952` occurrences with `#8a8980` (`5.63:1` on `#0a0a0b`, `5.36:1` on `#111113`, `5.04:1` on `#18181b` — all strictly above `4.5:1`) or `#9a9992` (`6.20:1–6.92:1`):
     - `globals.css`: `--text3: #8a8980;`
     - `tailwind.config.ts`: `text.muted: "#8a8980"`
     - `Footer.tsx`, `FileQueue.tsx`, `FormatSelector.tsx`, `SettingsModal.tsx`: replace `text-[#5a5952]` with `text-[#8a8980]` or `text-[#9a9992]`.
5. **Interactive Accessibility (`DropZone.tsx`, `SettingsModal.tsx`, `FormatSelector.tsx`, `Faq.tsx`, `FileQueue.tsx`):**
   - `DropZone.tsx` empty-state drop area: add `role="button"`, `tabIndex={0}`, `aria-label="Drop files here or press Enter to browse files"`, and `onKeyDown` triggering file picker on `Enter` or `Space` (`e.preventDefault()`). Ensure inner "Select Folder" button calls `e.stopPropagation()` so it does not trigger the parent file input.
   - `SettingsModal.tsx`: add `role="dialog"`, `aria-modal="true"`, `aria-labelledby="settings-modal-title"` (matching `<h3 id="settings-modal-title">`), backdrop `onClick={onClose}` with `onClick={(e) => e.stopPropagation()}` on the modal card, `Escape` `keydown` listener when `isOpen`, and `aria-label="Close settings"` on `<X />`.
   - `FormatSelector.tsx`: add `aria-haspopup="listbox"`, `aria-expanded={isOpen}`, and `Escape` close.
   - `Faq.tsx`: add `aria-expanded={isOpen}`.
   - `FileQueue.tsx`: add explicit `aria-label` to settings and remove icon buttons.
6. **CSS & Tailwind Hygiene (`globals.css`, `tailwind.config.ts`, `page.tsx`):**
   - Define `fadeIn` keyframes and `"fade-in": "fadeIn 150ms ease-out"` in `tailwind.config.ts` (so `animate-fade-in` in `FormatSelector.tsx` and `SettingsModal.tsx` works).
   - Delete unused `.acid-card`, `.acid-card:hover`, `.acid-card-active` rules from `src/app/globals.css`.
   - Replace `.hero-grid` (`codex-grid-background` boilerplate missing `-webkit-mask-image`) and heavy `.blob` (`filter: blur(90px)`) elements with a crisp instrument micro-grid (`background-size: 48px 48px`, both `-webkit-mask-image` and `mask-image`, zero `blur(90px)` fixed layers).
   - Add `@media (prefers-reduced-motion: reduce)` rule in `src/app/globals.css` setting `animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important;`.

### (g) Tooling, TypeScript Strictness & CI Gate
1. **TypeScript (`tsconfig.json`, `mediaConverter.ts`, `ConverterWorkspace.tsx`, `documentConverter.ts`, `imageConverter.ts`):**
   - Add `"noUncheckedIndexedAccess": true` to `tsconfig.json`.
   - Fix all 10 indexed-access errors across `ConverterWorkspace.tsx`, `documentConverter.ts`, and `imageConverter.ts`.
   - Replace `let ffmpegInstance: any = null` and `let loadingPromise: Promise<any> | null = null` in `mediaConverter.ts` with `FFmpeg | null` and `Promise<FFmpeg> | null` imported via `import type { FFmpeg } from "@ffmpeg/ffmpeg";`. Replace `catch (err: any)` in `ConverterWorkspace.tsx` with `catch (err: unknown)` + `err instanceof Error ? err.message : "Conversion failed"`.
2. **ESLint 9 (`eslint.config.mjs`, `package.json`):**
   - Install `eslint@^9.39.5` and `eslint-config-next@15.5.29` (plus `@eslint/eslintrc` or flat config compat via `FlatCompat` — verified standard for `eslint-config-next@15.5.29` under ESLint 9).
   - Update `package.json` `"lint": "eslint . --max-warnings=0"` (or `"eslint src tests"` + `next typegen` cleanly) so `npm run lint` never triggers `next lint`'s interactive prompt.
3. **Vitest (`vitest.config.ts`, `tests/unit/*.test.ts`):**
   - Install `vitest@^5.1.2` (`@vitest/coverage-v8` optional) + `jsdom` (if needed for hook/UI tests) or node environment with synthetic PNG/JPEG/PDF fixture generators.
   - Update `package.json` `"test": "vitest run"`.
4. **Playwright (`playwright.config.ts`, `tests/e2e/*.spec.ts`, `tests/fixtures/`):**
   - Install `@playwright/test@^1.65.1` and generate deterministic synthetic fixtures (valid PNG, JPEG with `0xFFE1` EXIF segment, multi-page PDF via `pdf-lib`, deterministic playable `sample.webm` video clip with `duration > 0` without relying on system `ffmpeg` in CI, `sample.wav`, unknown `.xyz` file, folder fixture directory).
   - Configure `playwright.config.ts` to run `npm run build && npm run start` (production server on `http://127.0.0.1:3000` with real `COOP`/`COEP` headers!).
5. **GitHub Actions CI (`.github/workflows/ci.yml`):**
   - Run on `push` (`main`) and `pull_request`: Node 24, `npm ci`, `npm run sync-assets`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npx playwright install --with-deps chromium`, `npm run build`, `npx playwright test`.

### (h) Phase 2 — Feature & Instrument UI Design
1. **Before/After Visual Diff Slider (`src/components/converter/VisualDiffModal.tsx`):**
   - Available on completed image jobs (`job.category === "image" && job.targetFormat !== "pdf" && job.outputFiles?.[0]`).
   - Uses `role="slider"`, `aria-valuemin={0}`, `aria-valuemax={100}`, `aria-valuenow={splitPct}`, `aria-label="Comparison split position"`.
   - Supports mouse/pointer drag, touch drag, and keyboard `ArrowLeft`/`ArrowRight` (1% step, `Shift` = 10% step), `Home`/`End`.
   - Creates original preview URL (`URL.createObjectURL(job.file)`) on open (for HEIC inputs, renders fallback notice or decoded preview) and revokes on close; compares side-by-side using CSS `clip-path: inset(0 ${100 - splitPct}% 0 0)` with exact input vs. output dimensions & byte delta readout.
2. **NumberFlow Size Savings Telemetry (`@number-flow/react`, `src/components/converter/SavingsTelemetry.tsx`, `FileQueue.tsx`, `ActionToolbar.tsx`):**
   - Install `@number-flow/react@^0.6.2`.
   - **Row-level (`FileQueue.tsx`):** Show `inputSize → outputSize` + signed delta badge (`-42.3%` in Acid Lime `#c8f03c`, `+4.1%` in Signal Pink `#f03c8c`).
   - **Batch-level (`SavingsTelemetry.tsx` inside `ActionToolbar.tsx` / workspace header):** Aggregate `totalInputBytes`, `totalOutputBytes`, `bytesSaved`, and `percentSaved` rendered with `<NumberFlow />` (`tabular-nums`, `font-mono`), respecting `prefers-reduced-motion` (`respectMotionReduction` / `animated={!prefersReducedMotion}`).
3. **Mediabunny / WebCodecs Video Trim & Compress (`src/lib/converters/webcodecsMedia.ts`, `mediaConverter.ts`, `SettingsModal.tsx`):**
   - Install `mediabunny@^1.66.5`.
   - Extend `ConversionSettings` (`src/types/converter.ts`):
     ```ts
     trimStart?: number | null; // seconds >= 0
     trimEnd?: number | null;   // seconds > trimStart
     videoQualityPreset?: "high" | "balanced" | "compact";
     videoBitrateMbps?: number | null;
     stripExif?: boolean; // default true
     ```
   - **Capability & Routing Strategy (`transcodeMedia` in `mediaConverter.ts`):**
     - Check `canUseMediabunny(targetFormat, settings)`:
       - Requires `typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined"`.
       - Target format must be `"mp4"`, `"webm"`, or `"mov"` (audio extraction, `gif`, `mkv`, `avi` always route to self-hosted FFmpeg WASM).
       - Map `targetFormat` → Mediabunny codec candidate (`"mp4"`/`"mov"` → `"avc"`, `"webm"` → `"vp9"`/`"vp8"`). Probe `canEncodeVideo(codec, { width, height, bitrate })` from `mediabunny`.
     - If supported: run `mediabunny` `Input` (`BlobSource`, `ALL_FORMATS`) + `Output` (`Mp4OutputFormat` / `WebMOutputFormat` / `MovOutputFormat`, `BufferTarget`) + `Conversion.init({ input, output, trim: { start, end }, video: { width, height, bitrate } })`, reporting progress via `conversion.onProgress`. If Mediabunny reports `!conversion.isValid` or throws at runtime, **seamlessly fall back** to self-hosted `@ffmpeg/ffmpeg` WASM!
     - **FFmpeg WASM Fallback (`mediaConverter.ts`):** Support `-ss <trimStart>` and `-to <trimEnd>`, aspect-ratio-safe scaling (handling width-only `scale=${w}:-2`, height-only `scale=-2:${h}`, and bounded `maintainAspectRatio` `scale='min(w,iw)':...` rounded to even integers with `scale=trunc(oh*a/2)*2:...`), and CRF/bitrate flags mapped from `videoQualityPreset` / `quality` (`high` = CRF 20, `balanced` = CRF 26, `compact` = CRF 32).
     - **SettingsModal Video Controls:** When `category === "video"`, load `<video preload="metadata">` from a lifecycle-managed `URL.createObjectURL(file)` to read `duration`, display `Trim Start (s)` and `Trim End (s)` numeric + range inputs (validated `0 <= trimStart < trimEnd <= duration`), compression preset (`High`, `Balanced`, `Compact`), and a live engine capability badge (`WEBCODECS HW` in Cobalt vs `FFMPEG WASM` fallback).
4. **EXIF Stripper (`src/lib/converters/exif.ts`, `imageConverter.ts`, `SettingsModal.tsx`, `FileQueue.tsx`):**
   - Pure-TS binary metadata module `src/lib/converters/exif.ts` (using `DataView` / explicit bounds checks for `noUncheckedIndexedAccess`):
     - `inspectImageMetadata(file: File | Blob): Promise<{ hasExif: boolean; hasXmp: boolean; markers: string[]; orientation?: number }>`: scans JPEG segments (`0xFFE1` `Exif\0\0` / XMP `http://ns.adobe.com/xap/1.0/`, `0xFFE2` ICC/APP2, `0xFFED` IPTC, `0xFFFE` COM) and parses the TIFF IFD0 `0x0112` (`Orientation`) tag (`"II"` little-endian and `"MM"` big-endian), PNG chunks (`eXIf`, `tEXt`, `zTXt`, `iTXt`), and WebP RIFF `EXIF`/`XMP ` chunks.
     - `stripJpegBinaryMetadata(bytes: Uint8Array): Uint8Array`: strips `APP1` (`0xFFE1`), `APP13` (`0xFFED`), and `COM` (`0xFFFE`) markers losslessly while preserving `SOI`, `APP0` (`JFIF`), `APP2` (ICC profile optional/keep or strip per option — keep `SOF`/`DHT`/`DQT`/`SOS` entropy stream intact).
   - In `imageConverter.ts`:
     - Inspect EXIF metadata (including `orientation`) before choosing any lossless fast-path.
     - Default `settings.stripExif ?? true`. When `stripExif === true`, `file` is JPEG targeting `"jpeg"`/`"jpg"` with no resize (`!width && !height`), `quality >= 98`, **and** EXIF `orientation` is absent or `1` (`!exifInfo.orientation || exifInfo.orientation === 1`), use the lossless `stripJpegBinaryMetadata` fast-path (zero re-compression loss, zero EXIF bytes).
     - Whenever `orientation > 1` (e.g., rotated smartphone portrait JPEG `Orientation: 6`) or format/dimensions/quality require re-encoding, bypass the binary fast-path and decode via `createImageBitmap(processedBlob, { imageOrientation: "from-image" })` + Canvas re-encode so pixels are baked upright and never saved sideways.
     - If user toggles `stripExif: false` in `SettingsModal`, only preserve bytes on no-op same-format lossless pass; if format/dimensions/quality require Canvas re-encode, UI displays an honest note: `"Format/resize conversion via Canvas always removes EXIF metadata."`
   - In `FileQueue.tsx`: display a subtle `EXIF` indicator badge on images detected with metadata prior to conversion, changing to `STRIPPED` after conversion with `stripExif !== false`.
5. **Custom Dimensions, 10 Legacy Presets, Queue Thumbnails & Folder Drop:**
   - **10 Legacy Presets (`SettingsModal.tsx`):** Restore exact presets from `legacy/app.js:3-14`:
     `Original` (`null×null`), `320×240` (`QVGA`), `480p` (`854×480`), `640×480` (`VGA`), `720p` (`1280×720`), `800×600` (`SVGA`), `1080p` (`1920×1080`), `1440p` (`2560×1440`), `2048p` (`2048×1536`), `4K UHD` (`3840×2160`).
   - **Custom W/H + Aspect Lock (`SettingsModal.tsx`):** Add numeric `Width (px)` and `Height (px)` inputs (`min={1}`, `max={16384}`). When `maintainAspectRatio` is locked and source dimensions `(srcWidth, srcHeight)` are known (passed from `JobThumbnail` or read via `createImageBitmap`/video metadata), editing `width` auto-calculates proportional `height` and vice versa.
   - **Queue Thumbnails (`src/components/converter/JobThumbnail.tsx`):** `48×48` (`w-12 h-12`) crisp framed thumbnail creating & revoking `URL.createObjectURL(job.file)` via `useEffect` cleanup for `image/*` (excluding HEIC unless browser supports) and `<video muted playsInline preload="metadata">` for `video/*`, falling back to styled hardware category/extension badges for audio/PDF/HEIC.
   - **Folder Drop & Picker (`DropZone.tsx`):**
     - Add secondary `"Select Folder"` button + hidden `<input type="file" multiple ref={folderInputRef} ... />` (augmenting `React.InputHTMLAttributes<HTMLInputElement>` with `webkitdirectory?: string; directory?: string;` in `src/types/react.d.ts` and/or setting attributes via `useEffect` `setAttribute` so `tsc --noEmit` passes under `@types/react@19` + `strict: true` while `[webkitdirectory]` stays in the DOM) with `e.stopPropagation()`.
     - Upgrade `handleDrop` to traverse `e.dataTransfer.items` using `webkitGetAsEntry()` (`FileSystemFileEntry` / `FileSystemDirectoryEntry.createReader()`, looping `readEntries()` until empty array!), filtering hidden dotfiles (`name.startsWith(".")`) and zero-byte files (`file.size === 0`).
6. **Teenage Engineering / Cobalt Acid Instrument UI Design System:**
   - **Palette & Surfaces:**
     - Chassis `#0a0a0b` (`--bg`), Module Bay `#111113` (`--bg2`), Control Well `#18181b` (`--bg3`), Hairline border `rgba(255,255,255,0.08)`.
     - Primary Action LED: Acid Lime `#c8f03c`; Hardware/Telemetry Accent: Cobalt `#2563eb` / `#60a5fa` (text `#60a5fa` meets `>= 4.5:1` on dark surfaces); Warning/Destructive: Signal Pink `#f03c8c`; Muted Text `#8a8980` (`>= 5.04:1` on all backgrounds).
   - **Typography:** `Syne` (display), `DM Sans` (UI copy), `JetBrains Mono` (`--font-mono`, `tabular-nums` for telemetry, step tags `01 // INPUT`, `02 // QUEUE`, `03 // OUTPUT`, dimensions, percentages, and timers).
   - **Geometry:** Structural `1px` hairlines, sharp `rounded-lg`/`rounded-xl` hardware modules (`<= 12px` radius), tactile micro-switches, recessed status LEDs, removal of heavy `blur(90px)` ambient blobs and `.acid-card`.

---

## 5. Verification & Delivery Architecture

1. **Synthetic Fixtures (`tests/fixtures/`):** Deterministically generated tiny valid assets (without requiring system `ffmpeg` in CI): 16×16 PNG, oversized 512×384 transparent PNG, JPEG with injected `0xFFE1` EXIF `Exif\0\0` segment, 2-page PDF via `pdf-lib`, playable `sample.webm` video clip (`duration > 0`, deterministic pure-TS/embedded binary), `sample.wav` audio clip, unsupported `.xyz` file, and folder fixture.
2. **Unit Tests (Vitest — `tests/unit/`):**
   - `detector.test.ts`: extension/MIME routing + explicit `{ supported: false }` for unknown files.
   - `registry.test.ts`: confirms `"pdf"` absent from `AVAILABLE_TARGETS.document`, valid targets for image/video/audio.
   - `encoders.test.ts`: verifies `BM` 24-bit DIB header/size for `encodeBmpFromImageData` and `00 00 01 00` ICONDIR + PNG payload (`<=256px`) for `encodeIcoFromPngBytes`.
   - `imageConverter.test.ts`: verifies AVIF strict `blob.type === "image/avif"` gate (throws explicit error when canvas returns `image/png`, never leaks PNG bytes), orientation-baked `stripExif`, and dimensions math.
   - `documentConverter.test.ts`: verifies `%PDF-` magic bytes for 1-image and multi-image `mergeImagesToPdf`, sequential bitmap `.close()`, and `page.cleanup()` + `pdf.destroy()` calls in `extractPdfToImages`.
   - `archive.test.ts`: verifies `createZipArchive` deduplicates colliding filenames (`photo.webp`, `photo (1).webp`) across root & folders.
   - `exif.test.ts`: verifies `inspectImageMetadata` detects injected `APP1` EXIF and `stripJpegBinaryMetadata` removes `0xFFE1` while preserving valid JPEG SOI/EOI markers.
   - `mediaConverter.test.ts`: verifies Mediabunny vs FFmpeg routing predicate, trim/scale FFmpeg CLI args (including height-only and aspect-locked dimensions), and zero `unpkg.com` URLs.
3. **E2E Tests (Playwright — `tests/e2e/`):**
   - Runs against production `next build` + `next start` (`COOP: same-origin`, `COEP: require-corp`).
   - Intercepts all network requests (`page.on("request", ...)`) and asserts **zero** requests to `unpkg.com` during PDF extraction and FFmpeg media conversion.
   - Verifies single-image → PDF download starts with `%PDF-`; multi-image `mergeToPdf` deletion down to 1 image converts cleanly without sticking in `pending`; `document` selector has no `PDF` option; unknown file triggers `[role="alert"]`; no leaked unrevoked `blob:` URLs across convert/remove/clear.
   - Verifies brand text `Pixshift` (zero `Pixyshift`), exact R3 copy, `/opengraph-image` returns HTTP 200 `image/png` at `1200×630`, WCAG AA contrast (`>= 4.5:1`), `DropZone` keyboard activation, `SettingsModal` `role="dialog"` / `Escape` / backdrop close, and `prefers-reduced-motion: reduce`.
   - Verifies Phase 2: Visual Diff Slider drag & arrow keys, `@number-flow/react` savings telemetry updates, video trim & compress controls + capability badge, EXIF strip toggle & verification, 10 resolution presets + custom W/H + thumbnails, and `webkitdirectory` folder upload.
4. **Delivery:** Push verified branch to `origin/main` (`https://github.com/vrsn001/pixshift`) and deploy via Vercel CLI (`vercel --prod`) to `pixyshift`, verifying `https://pixyshift.vercel.app` returns HTTP 200.
