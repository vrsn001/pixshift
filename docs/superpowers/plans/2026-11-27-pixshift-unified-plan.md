# Pixshift Unified Phase 1 & Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize Pixshift's client-side conversion engines, self-hosted WASM/worker assets, branding, WCAG AA accessibility, and CI testing gate (Phase 1), then deliver the Visual Diff Slider, NumberFlow Size Savings Telemetry, Mediabunny/WebCodecs video trim & compression, EXIF metadata stripper, custom dimensions + 10 legacy presets + thumbnails + folder drop, and Teenage Engineering / Cobalt instrument UI rebuild (Phase 2), followed by GitHub push and Vercel deployment.

**Architecture:** Modular browser-only Next.js 15 App Router application (`C:\Users\HP\Pixshift`). Pure TypeScript encoders/scanners (`encoders.ts`, `exif.ts`, `detector.ts`, `archive.ts`), same-origin self-hosted `@ffmpeg/core` and `pdfjs-dist` worker assets under `public/`, hybrid Mediabunny WebCodecs + FFmpeg WASM media pipeline, and React 19 UI components with strict Blob URL lifecycle management.

**Tech Stack:** Next.js `15.5.29`, React `19`, TypeScript `5.7.2` (`strict` + `noUncheckedIndexedAccess`), Tailwind CSS `3.4.16`, `@ffmpeg/ffmpeg` `0.12.15`, `@ffmpeg/core` `0.12.10`, `pdf-lib` `1.17.1`, `pdfjs-dist` `4.10.38`, `heic2any` `0.0.4`, `jszip` `3.10.1`, `mediabunny` `1.66.5`, `@number-flow/react` `0.6.2`, ESLint `9.39.5` + `eslint-config-next` `15.5.29`, Vitest `5.1.2`, Playwright `1.65.1`.

**Spec:** `docs/superpowers/specs/2026-11-27-pixshift-unified-design.md`

## Global Constraints

- **100% Browser-Only:** Zero server uploads; static/SSR Next.js compatible with Vercel Hobby.
- **COOP/COEP Headers (`next.config.ts` & `vercel.json`):** `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on `/(.*)` — zero runtime requests to `unpkg.com` or external CDNs.
- **TypeScript Strictness (`tsconfig.json`):** `"strict": true` and `"noUncheckedIndexedAccess": true` with zero `any` in `src/lib/converters/mediaConverter.ts` and zero TS errors (`npx tsc --noEmit`).
- **Tailwind CSS v3 (`tailwind.config.ts`):** Project uses Tailwind `3.4.16` + `postcss.config.mjs` — do NOT use Tailwind v4 `@theme` syntax.
- **ESLint 9 Pinning:** Pin `eslint@^9.39.5` alongside `eslint-config-next@15.5.29`; `npm run lint` must exit 0 non-interactively.
- **Brand & Copy:** Visible brand is **Pixshift** (never `Pixyshift`); Vercel project `pixyshift` and host `https://pixyshift.vercel.app` remain unchanged. Exact R3 Hero/Feature copy applies.
- **Accessibility:** All text meets WCAG AA (`>= 4.5:1`, replacing all `#5a5952` with `#8a8980` or `#9a9992`), interactive controls support keyboard & ARIA roles, and `prefers-reduced-motion: reduce` is honored.
- **Honest Encoding:** Never output PNG bytes with `.pdf`, `.bmp`, `.ico`, or `.avif` filenames.

## Review Focus

1. **Stale `mergeToPdf` when deleting/retargeting down to 1 image:** Removing or retargeting images from a multi-image PDF queue while `mergeToPdf` is `true` must reset `mergeToPdf` to `false` and allow the lone remaining image to convert via `mergeImagesToPdf([job.file])` instead of staying stuck in `"pending"`. (Pinned in **Task 4** & **Task 6**).
2. **Oversized or transparent RGBA image → `.ico` / `.bmp`:** Converting a `512×384` RGBA PNG with transparency to `.ico` must downscale proportionally to `256×192` (`<=256px`) with valid `00 00 01 00` header + PNG payload; converting to `.bmp` must composite transparency over white (`#ffffff`) and emit a 4-byte-padded 24-bit `BM` DIB. (Pinned in **Task 2**).
3. **Browser lacking native `OffscreenCanvas` AVIF encoding:** If `convertToBlob({ type: "image/avif" })` throws or silently returns `image/png`, `convertImage` must throw an explicit unsupported error rather than exporting PNG bytes named `.avif`. (Pinned in **Task 2**).
4. **Invalid video trim bounds or unsupported WebCodecs codec/container:** `trimStart >= trimEnd` or negative bounds must fail validation/clamp safely, and containers (`mkv`, `avi`, `gif`) or environments where `canEncodeVideo` is `false` must fall back cleanly to self-hosted `@ffmpeg/ffmpeg` WASM. (Pinned in **Task 7**).
5. **Dropped folders with dotfiles, 0-byte files, and colliding output names:** Recursive `webkitGetAsEntry()` traversal must ignore `.DS_Store`/dotfiles and `size === 0` files, and `createZipArchive` must deduplicate colliding filenames (`photo.webp`, `photo (1).webp`) instead of silently overwriting entries. (Pinned in **Task 4** & **Task 9**).

---

## File Structure

### Tooling, Assets & CI
- `package.json` — scripts (`lint`, `test`, `test:e2e`, `sync-assets`, `postinstall`, `prebuild`) and dependencies (`@ffmpeg/core`, `mediabunny`, `@number-flow/react`, `eslint@^9.39.5`, `eslint-config-next`, `vitest`, `@playwright/test`).
- `tsconfig.json` — enables `"noUncheckedIndexedAccess": true` (and Vitest/Playwright compatibility).
- `eslint.config.mjs` — ESLint 9 flat config wrapping `next/core-web-vitals` + `next/typescript`.
- `vitest.config.ts` — Vitest unit test configuration (`node` environment, `@/` alias).
- `playwright.config.ts` — Playwright configuration running production `npm run start` after build on port `3000`.
- `scripts/copy-wasm-assets.mjs` — idempotent asset copier syncing `@ffmpeg/core` (`dist/esm/ffmpeg-core.js`, `ffmpeg-core.wasm`) and `pdfjs-dist` (`pdf.worker.min.mjs`) into `public/ffmpeg/` and `public/pdfjs/`.
- `.github/workflows/ci.yml` — CI gate running `sync-assets`, `lint`, `tsc --noEmit`, `vitest run`, `next build`, and `playwright test`.

### Core Conversion & Utility Modules
- `src/types/converter.ts` — `ConversionSettings` (with trim, bitrate preset, `stripExif`), `ExifInfo`, `ConversionJob` metadata fields.
- `src/types/react.d.ts` — React 19 `InputHTMLAttributes` module augmentation adding `webkitdirectory?: string; directory?: string;`.
- `src/lib/converters/registry.ts` — removes `"pdf"` from `AVAILABLE_TARGETS.document`.
- `src/lib/converters/detector.ts` — `FileDetectionResult` discriminated union rejecting unknown files explicitly.
- `src/lib/converters/encoders.ts` — pure-TS `encodeBmpFromImageData` and `encodeIcoFromPngBytes`.
- `src/lib/converters/exif.ts` — pure-TS `inspectImageMetadata` (JPEG/PNG/WebP) and `stripJpegBinaryMetadata`.
- `src/lib/converters/imageConverter.ts` — uses `encoders.ts`, strict AVIF `blob.type` check + `supportsAvifEncoding()`, orientation-baked `createImageBitmap`, and EXIF stripping.
- `src/lib/converters/documentConverter.ts` — self-hosted `/pdfjs/pdf.worker.min.mjs`, sequential bitmap decoding + `.close()`, HEIC handling, `page.cleanup()`, `pdf.destroy()`, strict `png`/`jpeg` target guard.
- `src/lib/converters/webcodecsMedia.ts` — Mediabunny WebCodecs video trim & compression with codec capability probing.
- `src/lib/converters/mediaConverter.ts` — typed `FFmpeg` instance (zero `any`), self-hosted `/ffmpeg/ffmpeg-core.*`, Mediabunny routing + FFmpeg WASM fallback, trim (`-ss`/`-to`), height-only & aspect-safe scaling, quality CRF.
- `src/lib/utils/archive.ts` — `deduplicateArchivePath` + JSZip collision-safe archiving.
- `src/lib/utils/folderDrop.ts` — recursive `FileSystemEntry` / `webkitGetAsEntry` directory traversal filtering dotfiles and 0-byte files.

### App Shell & UI Components
- `src/app/opengraph-image.tsx` — `1200×630` PNG social card via `ImageResponse`.
- `src/app/layout.tsx` — removes broken `/logo.svg` OG/Twitter images, loads `JetBrains_Mono`, updates metadata.
- `src/app/globals.css` & `tailwind.config.ts` — WCAG AA `#8a8980`, `fadeIn` keyframes, removes `.acid-card` & `.blob`, crisp `.hero-grid` instrument grid, `prefers-reduced-motion` support, Cobalt + Acid Lime tokens.
- `src/app/page.tsx` — exact R3 Hero/Feature copy + Phase 2 instrument layout shell.
- `src/components/Header.tsx`, `src/components/Footer.tsx`, `src/components/Faq.tsx`, `public/logo.svg`, `README.md` — **Pixshift** brand unification, WCAG AA text contrast, ARIA attributes.
- `src/components/converter/DropZone.tsx` — keyboard activation (`role="button"`, `tabIndex={0}`, Enter/Space) + folder picker (`webkitdirectory`) & recursive drop.
- `src/components/converter/SettingsModal.tsx` — `role="dialog"`, `aria-modal="true"`, `Escape` & backdrop close, 10 legacy presets, custom W/H + aspect lock, video trim/preset/capability badge, EXIF strip toggle.
- `src/components/converter/FormatSelector.tsx` — `aria-haspopup="listbox"`, `aria-expanded`, `Escape` close, AVIF capability indicator, WCAG AA text.
- `src/components/converter/JobThumbnail.tsx` — lifecycle-managed `48×48` image/video thumbnail with extension badge fallback.
- `src/components/converter/VisualDiffModal.tsx` — interactive before/after image comparison slider (`role="slider"`, pointer/touch/arrow keys).
- `src/components/converter/SavingsTelemetry.tsx` — `@number-flow/react` batch byte & percentage savings telemetry.
- `src/components/converter/FileQueue.tsx` — thumbnails, EXIF badge, row byte savings, Compare trigger, accessible labels.
- `src/components/converter/ActionToolbar.tsx` — batch `SavingsTelemetry`, `mergeToPdf` toggle, clear/download/convert controls.
- `src/components/converter/ConverterWorkspace.tsx` — single `image → pdf` routing, `mergeToPdf` auto-reset invariant, unsupported-file `role="alert"` notice, Blob URL revocation lifecycle, `unknown` catch typing.

---

## Phase 1 — Tooling, Converter Fixes, Self-Hosting, Brand, A11y & SEO

### Task 1: Tooling, TypeScript Strictness, Synthetic Fixtures & CI Gate

**Files:**
- Modify: `tsconfig.json`
- Modify: `package.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `tests/fixtures/generateFixtures.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: Runnable `npm run lint` (ESLint 9), `npx tsc --noEmit` (`noUncheckedIndexedAccess: true`), `npm test` (Vitest), `npm run test:e2e` (Playwright), and deterministic fixture helper `ensureFixtures(dir)` generating valid synthetic PNG, EXIF-tagged JPEG, 2-page PDF, playable `sample.webm` (`duration > 0` without system `ffmpeg`), `sample.wav`, unknown `.xyz`, and nested folder fixtures.

- [ ] **Step 1: Install Phase 1 dev tooling dependencies (`eslint@^9.39.5`, `eslint-config-next@15.5.29`, `@eslint/eslintrc`, `vitest@^5.1.2`, `@playwright/test@^1.65.1`, `tsx`)**
  Run: `npm install -D eslint@^9.39.5 eslint-config-next@15.5.29 @eslint/eslintrc vitest@^5.1.2 @playwright/test@^1.65.1`
  Expected: `package-lock.json` and `node_modules/` updated cleanly with ESLint `9.x`.

- [ ] **Step 2: Configure `tsconfig.json` with `"noUncheckedIndexedAccess": true` and update `package.json` scripts**
  - Add `"noUncheckedIndexedAccess": true` inside `compilerOptions` in `tsconfig.json`.
  - Update `package.json` scripts:
    - `"lint": "eslint src tests scripts"`
    - `"test": "vitest run"`
    - `"test:e2e": "playwright test"`
    - `"typecheck": "tsc --noEmit"`

- [ ] **Step 3: Create `eslint.config.mjs`, `vitest.config.ts`, and `playwright.config.ts`**
  - `eslint.config.mjs`: use `FlatCompat` (`@eslint/eslintrc`) extending `"next/core-web-vitals"` and `"next/typescript"`, ignoring `.next/**`, `legacy/**`, `public/ffmpeg/**`, `public/pdfjs/**`, `playwright-report/**`, `test-results/**`.
  - `vitest.config.ts`: configure `resolve.alias["@"] = path.resolve(__dirname, "./src")`, `test.include = ["tests/unit/**/*.test.ts"]`, `test.environment = "node"`.
  - `playwright.config.ts`: configure `testDir: "./tests/e2e"`, `use: { baseURL: "http://127.0.0.1:3000" }`, `webServer: { command: "npm run start", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 }`.

- [ ] **Step 4: Create `tests/fixtures/generateFixtures.ts` and `.github/workflows/ci.yml`**
  - `generateFixtures.ts`: creates deterministic binary fixtures in `tests/fixtures/generated/` (with zero reliance on system `ffmpeg` in CI):
    - `sample.png` (valid 16×16 RGBA PNG with CRC32 chunks)
    - `transparent-large.png` (512×384 RGBA PNG with transparent corner pixels)
    - `photo-exif.jpg` (valid minimal JPEG with injected `0xFFE1` `Exif\0\0` APP1 segment)
    - `sample-2page.pdf` (valid 2-page PDF created via `pdf-lib`)
    - `sample.webm` (deterministic minimal valid, playable VP8 WebM video clip with real video frames and `duration > 0`, written from a self-contained pure-TS EBML/WebM byte buffer or checked-in deterministic tiny `tests/fixtures/sample.webm` copied into `generated/` — never invoking system `ffmpeg`)
    - `sample.wav` (valid 0.25s 44.1kHz PCM WAV file for audio conversion tests)
    - `unknown.xyz` (arbitrary binary payload)
    - `folder-drop/sub/nested.png` + `folder-drop/.DS_Store` + `folder-drop/empty.png` (0 bytes)
  - `.github/workflows/ci.yml`: triggers on `push` (`main`) and `pull_request`, Node 24, `npm ci`, `npm run sync-assets`, `npm run lint`, `npm run typecheck`, `npm test`, `npx playwright install --with-deps chromium`, `npm run build`, `npm run test:e2e`.

- [ ] **Step 5: Verify tooling configs load (expect typecheck to report the 10 pre-existing `noUncheckedIndexedAccess` errors)**
  Run: `npx vitest --version && npx playwright --version && npx eslint --version`
  Expected: Vitest `5.x`, Playwright `1.65.x`, ESLint `9.39.x`.

- [ ] **Step 6: Commit**
  ```bash
  git add package.json package-lock.json tsconfig.json eslint.config.mjs vitest.config.ts playwright.config.ts tests/fixtures/generateFixtures.ts .github/workflows/ci.yml
  git commit -m "chore: configure ESLint 9, Vitest, Playwright, strict TS, fixtures, and CI"
  ```

---

### Task 2: Pure-TS Binary Encoders (BMP/ICO), AVIF Capability Guard & Image Converter Fixes

**Files:**
- Create: `src/lib/converters/encoders.ts`
- Modify: `src/lib/converters/imageConverter.ts`
- Test: `tests/unit/encoders.test.ts`
- Test: `tests/unit/imageConverter.test.ts`

**Interfaces:**
- Consumes: `ConversionSettings` (`src/types/converter.ts`)
- Produces:
  - `encodeBmpFromImageData(imageData: { width: number; height: number; data: Uint8ClampedArray }): Blob`
  - `encodeIcoFromPngBytes(pngBytes: Uint8Array, width: number, height: number): Blob`
  - `preprocessImageFile(file: File): Promise<Blob>` (exported from `src/lib/converters/imageConverter.ts` for reuse in `documentConverter.ts`)
  - `supportsAvifEncoding(): Promise<boolean>`
  - `convertImage(file: File, targetFormat: string, settings: ConversionSettings, onProgress?: (pct: number) => void): Promise<Blob>`

- [ ] **Step 1: Write failing unit tests in `tests/unit/encoders.test.ts` and `tests/unit/imageConverter.test.ts`**
  - `encoders.test.ts`:
    - `test_encodeBmpFromImageData_writes_valid_24bit_BM_header_and_white_alpha_composite`: passes 3×2 RGBA buffer with transparent pixel `(0,0,0,0)` and opaque red `(255,0,0,255)`; asserts bytes `[0..1]` === `0x42, 0x4D` (`"BM"`), `fileSize === 54 + 24` (each 3px row = 9 bytes padded to 12 bytes × 2 rows = 24), `biBitCount === 24`, bottom-up BGR bytes for transparent pixel equal `(255, 255, 255)`, and `blob.type === "image/bmp"`.
    - `test_encodeIcoFromPngBytes_writes_valid_ICONDIR_header_and_png_payload`: passes dummy PNG bytes `[0x89, 0x50, 0x4e, 0x47, ...]` with `width=256, height=192`; asserts bytes `[0..5]` === `[0x00, 0x00, 0x01, 0x00, 0x01, 0x00]`, `bWidth === 0` (256 encoding in ICO spec), `bHeight === 192`, `dwBytesInRes === pngBytes.length`, `dwImageOffset === 22`, trailing bytes equal `pngBytes`, and `blob.type === "image/x-icon"`.
    - `test_encodeIcoFromPngBytes_rejects_dimensions_over_256`: asserts throws for `width=300`.
  - `imageConverter.test.ts`:
    - `test_convertImage_avif_throws_when_canvas_silently_returns_png`: mocks `OffscreenCanvas.convertToBlob` returning `new Blob([1, 2, 3], { type: "image/png" })` and `createImageBitmap`; asserts `convertImage(file, "avif", defaultSettings)` rejects with `/AVIF encoding is not supported/i` (never resolves with PNG bytes).
    - `test_convertImage_ico_scales_oversized_512x384_to_256x192`: mocks `createImageBitmap` returning `{ width: 512, height: 384, close: vi.fn() }` and verifies canvas dimensions `(256, 192)` and `00 00 01 00` output header.
    - `test_convertImage_heic_empty_array_guard`: satisfies `noUncheckedIndexedAccess` when `heic2any` returns `[]`.

- [ ] **Step 2: Run unit tests to verify they fail**
  Run: `npx vitest run tests/unit/encoders.test.ts tests/unit/imageConverter.test.ts`
  Expected: FAIL with missing `encoders.ts` and failing AVIF/ICO/BMP behavior.

- [ ] **Step 3: Implement `src/lib/converters/encoders.ts` and update `src/lib/converters/imageConverter.ts`**
  - Create `encoders.ts` using `DataView` and explicit bounds / nullish checks (`?? 0`) for `noUncheckedIndexedAccess` compliance: implement `encodeBmpFromImageData` (14-byte file header + 40-byte DIB header + 4-byte padded bottom-up BGR with white alpha composite) and `encodeIcoFromPngBytes` (6-byte ICONDIR + 16-byte ICONDIRENTRY + PNG bytes, validating `1..256`).
  - Update `imageConverter.ts`:
    - Export `preprocessImageFile` from `src/lib/converters/imageConverter.ts` so Task 3 (`documentConverter.ts`) can import and reuse it directly.
    - Fix `noUncheckedIndexedAccess` errors (`converted[0]` check in `preprocessImageFile`, base64 split guard).
    - Implement `supportsAvifEncoding()` (cached 1×1 `OffscreenCanvas`/`HTMLCanvasElement` check verifying `blob.type === "image/avif"`).
    - Route `"bmp"` via `ctx.getImageData(0, 0, width, height)` -> `encodeBmpFromImageData`.
    - Route `"ico"` by capping target dimensions proportionally to `<= 256` on max axis, encoding PNG via `convertToBlob`/`toBlob`, and passing bytes to `encodeIcoFromPngBytes`.
    - For `"avif"`, assert `resultBlob.type === "image/avif"`, throwing `new Error("AVIF encoding is not supported in this browser. Select WebP or JPEG instead.")` if not.

- [ ] **Step 4: Run unit tests to verify they pass**
  Run: `npx vitest run tests/unit/encoders.test.ts tests/unit/imageConverter.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/converters/encoders.ts src/lib/converters/imageConverter.ts tests/unit/encoders.test.ts tests/unit/imageConverter.test.ts
  git commit -m "fix: implement real BMP/ICO binary encoders and strict AVIF capability guard"
  ```

---

### Task 3: Registry, Unsupported-File Detector, Self-Hosted WASM/PDF Worker & Document Memory Fixes

**Files:**
- Modify: `package.json` (`@ffmpeg/core` dependency + `sync-assets`/`postinstall`/`prebuild`)
- Create: `scripts/copy-wasm-assets.mjs`
- Create (generated): `public/ffmpeg/ffmpeg-core.js`, `public/ffmpeg/ffmpeg-core.wasm`, `public/pdfjs/pdf.worker.min.mjs`
- Modify: `src/types/converter.ts`
- Modify: `src/lib/converters/registry.ts`
- Modify: `src/lib/converters/detector.ts`
- Modify: `src/lib/converters/documentConverter.ts`
- Modify: `src/lib/converters/mediaConverter.ts`
- Test: `tests/unit/registry.test.ts`
- Test: `tests/unit/detector.test.ts`
- Test: `tests/unit/documentConverter.test.ts`

**Interfaces:**
- Produces:
  - `FileDetectionResult = { supported: true; category: FileCategory; inputFormat: string; defaultTarget: SupportedFormat } | { supported: false; inputFormat: string; reason: string }`
  - `detectFileInfo(file: File): FileDetectionResult`
  - `mergeImagesToPdf(files: File[], onProgress?: (pct: number) => void): Promise<Blob>`
  - `extractPdfToImages(file: File, targetFormat?: "png" | "jpeg", onProgress?: (pct: number) => void): Promise<{ name: string; blob: Blob }[]>`
  - `getFFmpegInstance(onLog?: (msg: string) => void): Promise<FFmpeg>` (typed `FFmpeg` from `@ffmpeg/ffmpeg`, zero `any`, loads `/ffmpeg/ffmpeg-core.js` and `/ffmpeg/ffmpeg-core.wasm`)

- [ ] **Step 1: Write failing unit tests in `tests/unit/registry.test.ts`, `tests/unit/detector.test.ts`, and `tests/unit/documentConverter.test.ts`**
  - `registry.test.ts`:
    - `test_document_targets_exclude_pdf`: asserts `AVAILABLE_TARGETS.document` equals `["png", "jpeg"]` and does NOT include `"pdf"`.
    - `test_image_targets_include_pdf_bmp_ico_avif`: asserts `AVAILABLE_TARGETS.image` includes `"pdf"`, `"bmp"`, `"ico"`, `"avif"`.
  - `detector.test.ts`:
    - `test_detectFileInfo_rejects_unknown_extensions_and_mimes`: tests `readme.txt` (`text/plain`), `archive.zip` (`application/zip`), and `mystery.xyz` (`""`) -> all return `{ supported: false, ... }`.
    - `test_detectFileInfo_accepts_known_media_and_pdf`: tests `.png`, `.heic`, `.mp4`, `.mp3`, `.pdf` -> `{ supported: true, ... }`.
  - `documentConverter.test.ts`:
    - `test_mergeImagesToPdf_single_png_outputs_valid_pdf_magic_bytes`: passes `[samplePngFile]` -> verifies `bytes.slice(0, 5)` decodes to `"%PDF-"` and `blob.type === "application/pdf"`.
    - `test_mergeImagesToPdf_decodes_sequentially_and_closes_bitmaps`: passes 2 WebP files (mocking `createImageBitmap` + `HTMLCanvasElement`), verifies `createImageBitmap` is called one-by-one rather than pre-allocating all before page 1 embeds, and `bitmap.close()` is called for each.
    - `test_extractPdfToImages_cleans_up_pages_destroys_pdf_and_uses_local_worker`: mocks `pdfjs-dist` and verifies `GlobalWorkerOptions.workerSrc === "/pdfjs/pdf.worker.min.mjs"`, `page.cleanup()` called per page, `pdf.destroy()` called in `finally`, and rejecting `targetFormat === "pdf"` throws.

- [ ] **Step 2: Run unit tests to verify they fail**
  Run: `npx vitest run tests/unit/registry.test.ts tests/unit/detector.test.ts tests/unit/documentConverter.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Install `@ffmpeg/core@0.12.10` and create `scripts/copy-wasm-assets.mjs`**
  - Run: `npm install @ffmpeg/core@0.12.10`
  - Create `scripts/copy-wasm-assets.mjs` copying `node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js` -> `public/ffmpeg/ffmpeg-core.js`, `node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm` -> `public/ffmpeg/ffmpeg-core.wasm`, and `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` -> `public/pdfjs/pdf.worker.min.mjs`.
  - Wire `"sync-assets": "node scripts/copy-wasm-assets.mjs"`, `"postinstall": "npm run sync-assets"`, `"prebuild": "npm run sync-assets"` in `package.json`, then run `npm run sync-assets`.

- [ ] **Step 4: Update `src/types/converter.ts`, `registry.ts`, `detector.ts`, `documentConverter.ts`, and `mediaConverter.ts`**
  - `types/converter.ts`: set `DocumentFormat = "png" | "jpeg"`.
  - `registry.ts`: set `document: ["png", "jpeg"]`.
  - `detector.ts`: return `FileDetectionResult` discriminated union; remove generic `image`/`webp` fallback.
  - `documentConverter.ts`: fix all `noUncheckedIndexedAccess` errors; import `preprocessImageFile` from `./imageConverter` for HEIC preprocessing and decode bitmaps sequentially inside the `mergeImagesToPdf` loop with `try { ... } finally { bitmap.close(); }`; set `workerSrc = "/pdfjs/pdf.worker.min.mjs"`; wrap `page` in `try/finally { page.cleanup(); }` and `pdf` in `try/finally { await pdf.destroy(); }`; reject null `canvas.toBlob`; guard `targetFormat === "png" || targetFormat === "jpeg"`.
  - `mediaConverter.ts`: import `type { FFmpeg } from "@ffmpeg/ffmpeg"`, type `ffmpegInstance: FFmpeg | null` and `loadingPromise: Promise<FFmpeg> | null` (zero `any`), and replace `unpkg.com` `baseURL` with `"/ffmpeg"` (`toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript")` and `toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm")`).

- [ ] **Step 5: Run unit tests to verify they pass**
  Run: `npx vitest run tests/unit/registry.test.ts tests/unit/detector.test.ts tests/unit/documentConverter.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add package.json package-lock.json scripts/copy-wasm-assets.mjs public/ffmpeg/ public/pdfjs/ src/types/converter.ts src/lib/converters/registry.ts src/lib/converters/detector.ts src/lib/converters/documentConverter.ts src/lib/converters/mediaConverter.ts tests/unit/registry.test.ts tests/unit/detector.test.ts tests/unit/documentConverter.test.ts
  git commit -m "fix: self-host WASM/PDF worker, reject unknown files, remove PDF->PDF, and fix document memory leaks"
  ```

---

### Task 4: Zip Deduplication & `ConverterWorkspace` Routing / State / Blob URL Lifecycle

**Files:**
- Modify: `src/lib/utils/archive.ts`
- Modify: `src/components/converter/ConverterWorkspace.tsx`
- Modify: `src/components/converter/ActionToolbar.tsx`
- Test: `tests/unit/archive.test.ts`
- Test: `tests/unit/workspaceLogic.test.ts`

**Interfaces:**
- Produces:
  - `deduplicateArchivePath(name: string, folder: string | undefined, usedPaths: Set<string>): string` in `src/lib/utils/archive.ts`
  - Pure workspace state helpers exported from `src/components/converter/workspaceHelpers.ts` (or `ConverterWorkspace.tsx`): `shouldAutoResetMergeToPdf(jobs: ConversionJob[]): boolean`, `revokeJobUrls(job: ConversionJob): void`

- [ ] **Step 1: Write failing unit tests in `tests/unit/archive.test.ts` and `tests/unit/workspaceLogic.test.ts`**
  - `archive.test.ts`:
    - `test_createZipArchive_deduplicates_colliding_filenames`: passes `[{ name: "photo.webp", blob: b1 }, { name: "photo.webp", blob: b2 }, { name: "photo.webp", blob: b3 }]`, unzips output with `JSZip.loadAsync`, and asserts entries `["photo.webp", "photo (1).webp", "photo (2).webp"]` with preserved distinct contents!
    - `test_createZipArchive_deduplicates_within_same_folder_only`: tests `folder: "doc1"` collision vs `folder: "doc2"` same name (no unnecessary rename across different folders).
  - `workspaceLogic.test.ts`:
    - `test_mergeToPdf_resets_when_fewer_than_two_image_pdf_jobs_remain`: verifies removing 1 of 2 `image -> pdf` jobs (or retargeting 1 to `webp`) returns `shouldMerge = false`.
    - `test_lone_image_pdf_job_is_not_filtered_out_of_conversion_batch`: verifies single `image -> pdf` job routes to individual `mergeImagesToPdf([job.file])` even if stale `mergeToPdf` flag was previously set.

- [ ] **Step 2: Run unit tests to verify they fail**
  Run: `npx vitest run tests/unit/archive.test.ts tests/unit/workspaceLogic.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement zip deduplication in `src/lib/utils/archive.ts` and fix `ConverterWorkspace.tsx`**
  - Update `archive.ts` with `deduplicateArchivePath` using `usedPaths: Set<string>`.
  - Update `ConverterWorkspace.tsx`:
    - Partition `detectFileInfo(file)` results: queue `supported: true` jobs; store `supported: false` reasons in `rejectedNotices` rendered in a dismissible `role="alert"` banner.
    - Route single `job.category === "image" && job.targetFormat === "pdf"` inside `processJob` to `mergeImagesToPdf([job.file], ...)` and name output `${baseName}.pdf`.
    - Reset `mergeToPdf` to `false` inside `handleRemoveJob` and `handleUpdateFormat` whenever `< 2` jobs have `category === "image" && targetFormat === "pdf"`. Guard `const shouldMergePdf = mergeToPdf && imagePdfJobs.length >= 2` in `handleConvertAll`.
    - In `handleUpdateFormat`, revoke any previous `job.outputFiles` URLs via `revokeJobUrls(job)` AND clear `status: "pending"`, `progress: 0`, `outputFiles: undefined`, `error: undefined`, and `durationMs: undefined` (never leaving stale outputs/errors).
    - Guard `job.category === "document"` so only `"png" | "jpeg"` is passed to `extractPdfToImages`.
    - Track & revoke all created `OutputFile.url`s via `revokeJobUrls` on remove, clear all, format reset/re-conversion, and component unmount (`useEffect`).
    - Fix `noUncheckedIndexedAccess` (`const firstJob = imagePdfJobs[0]; if (!firstJob) ...`) and replace `catch (err: any)` with `catch (err: unknown)`.

- [ ] **Step 4: Run unit tests & `npx tsc --noEmit` to verify zero TypeScript errors**
  Run: `npx vitest run tests/unit/archive.test.ts tests/unit/workspaceLogic.test.ts && npx tsc --noEmit`
  Expected: All unit tests PASS and `tsc --noEmit` exits 0 with zero errors!

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/utils/archive.ts src/components/converter/ConverterWorkspace.tsx src/components/converter/ActionToolbar.tsx src/components/converter/workspaceHelpers.ts tests/unit/archive.test.ts tests/unit/workspaceLogic.test.ts
  git commit -m "fix: deduplicate zip entries, route single image->PDF, reset mergeToPdf, and revoke blob URLs"
  ```

---

### Task 5: Brand Unification, Exact Copy, `opengraph-image.tsx`, WCAG AA, A11y & CSS Hygiene

**Files:**
- Create: `src/app/opengraph-image.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/Footer.tsx`
- Modify: `src/components/Faq.tsx`
- Modify: `src/components/converter/DropZone.tsx`
- Modify: `src/components/converter/SettingsModal.tsx`
- Modify: `src/components/converter/FormatSelector.tsx`
- Modify: `src/components/converter/FileQueue.tsx`
- Modify: `public/logo.svg`
- Modify: `README.md`

**Interfaces:**
- Produces: Unified `Pixshift` branding, exact R3 copy, `1200×630` PNG `/opengraph-image`, WCAG AA `#8a8980`/`#9a9992` contrast across all surfaces, keyboard-accessible `DropZone`, dialog-accessible `SettingsModal`, `animate-fade-in`, `prefers-reduced-motion`, clean `.hero-grid`.

- [ ] **Step 1: Unify brand (`Pixshift`), exact R3 copy, and `README.md`**
  - Update `Header.tsx:19` and `Footer.tsx:12`: `Pix<span>shift</span>` (no `Pixyshift`).
  - Update `public/logo.svg`: `Pix<tspan fill="#c8f03c">shift</tspan>` (remove stale `v2.0`).
  - Update `src/app/page.tsx`:
    - Badge: `Runs in your browser`
    - Headline (`<h1>`): `Convert images, video, audio, and PDFs <em ...>on your device.</em>`
    - Subhead: `Drop media below to convert between WebP, AVIF, MP4, MP3, GIF, and PDF. Nothing gets uploaded because your browser does the work.`
    - 3 Feature card titles: `Your files stay on your disk`, `Batch queues with real controls`, `Pay for nothing`.
  - Update `README.md`: replace `"Obsidian/Slate dark glassmorphic theme"` and `"CloudConvert-Style Workflow"` with accurate Pixshift documentation (keeping `https://pixyshift.vercel.app` / `pixyshift` Vercel coordinates).

- [ ] **Step 2: Add `src/app/opengraph-image.tsx` (`1200×630`) and fix `src/app/layout.tsx` social metadata**
  - Create `src/app/opengraph-image.tsx` (`export const size = { width: 1200, height: 630 }`, `export const contentType = "image/png"`) rendering `Pixshift` logo + tagline via `ImageResponse` from `next/og`. It MUST use built-in/local styling only and MUST NOT make external font `fetch()` calls (e.g., Google Fonts) at build or runtime so it works cleanly offline in CI and under `COEP: require-corp`.
  - Remove broken `images: [{ url: "/logo.svg", ... }]` from `openGraph` and `images: ["/logo.svg"]` from `twitter` in `src/app/layout.tsx` so Next.js automatically binds `/opengraph-image`.

- [ ] **Step 3: Fix WCAG AA contrast, interactive A11y, and CSS hygiene**
  - Replace all 9 `#5a5952` usages (`globals.css`, `tailwind.config.ts`, `Footer.tsx`, `FileQueue.tsx`, `FormatSelector.tsx`, `SettingsModal.tsx`) with `#8a8980` (`>= 5.04:1`) or `#9a9992` (`>= 6.20:1`).
  - `DropZone.tsx` empty-state clickable container: add `role="button"`, `tabIndex={0}`, `aria-label="Drop files here or press Enter to browse files"`, `onKeyDown` triggering file picker on `Enter` or `" "` (`e.preventDefault()`).
  - `SettingsModal.tsx`: add `role="dialog"`, `aria-modal="true"`, `aria-labelledby="settings-modal-title"`, `Escape` key listener, backdrop `onClick={onClose}` (inner card `onClick={(e) => e.stopPropagation()}`), `aria-label="Close settings"` on close button.
  - `FormatSelector.tsx`: add `aria-haspopup="listbox"`, `aria-expanded={isOpen}`, `Escape` close.
  - `Faq.tsx`: add `aria-expanded={isOpen}`.
  - `FileQueue.tsx`: add `aria-label` on settings and remove buttons.
  - `tailwind.config.ts` & `src/app/globals.css`: add `fadeIn` keyframes + `"fade-in": "fadeIn 150ms ease-out"`; delete `.acid-card`, `.acid-card:hover`, `.acid-card-active`; add `@media (prefers-reduced-motion: reduce)` suppressing animations/transitions; fix `.hero-grid` (`-webkit-mask-image` + `mask-image`, crisp `48px` grid) and remove `.blob` blur layers from `globals.css` / `page.tsx`.

- [ ] **Step 4: Run lint, typecheck, and production build**
  Run: `npm run lint && npm run typecheck && npm run build`
  Expected: Zero lint errors, zero TS errors, `next build` passes cleanly.

- [ ] **Step 5: Commit**
  ```bash
  git add src/app/ src/components/ tailwind.config.ts public/logo.svg README.md
  git commit -m "feat(phase1): unify Pixshift brand, OG image, WCAG AA contrast, a11y, and CSS hygiene"
  ```

---

### Task 6: Phase 1 Playwright E2E Verification Gate

**Files:**
- Create: `tests/e2e/phase1-conversions.spec.ts`
- Create: `tests/e2e/phase1-a11y-brand.spec.ts`

**Interfaces:**
- Exercises: Built production app (`next start`) with COOP/COEP headers over HTTP.

- [ ] **Step 1: Write `tests/e2e/phase1-conversions.spec.ts`**
  - Intercept all network requests (`page.on("request", ...)`) and assert zero requests match `unpkg.com` during PDF extraction (`sample-2page.pdf -> png`) and audio/video conversion (`sample.wav -> mp3`).
  - Upload `sample.png`, select `pdf`, click Convert All -> verify download begins with `%PDF-` bytes.
  - Upload 2 PNGs, select `pdf`, enable `Merge images to single PDF`, remove 1 PNG -> verify checkbox disappears/resets, click Convert All -> verify lone PNG completes (`Done`) and does not stall in `pending`.
  - Upload `sample-2page.pdf` -> verify FormatSelector options contain only `PNG` and `JPEG` (no `PDF`).
  - Upload `unknown.xyz` -> verify visible `[role="alert"]` unsupported notice appears and no queue row is created.
  - Spy on `URL.createObjectURL` / `URL.revokeObjectURL` via `page.addInitScript` -> convert PNG to WebP, then click Remove -> verify created output `blob:` URL is revoked.

- [ ] **Step 2: Write `tests/e2e/phase1-a11y-brand.spec.ts`**
  - Verify rendered HTML has `"Pixshift"`, zero occurrences of `"Pixyshift"` (excluding canonical `pixyshift.vercel.app` meta tags), and exact R3 Hero Badge / Headline / Subhead / 3 Feature Card titles.
  - Fetch `/opengraph-image` -> assert HTTP `200`, `content-type: image/png`, and PNG header dimensions `1200×630` (reading IHDR bytes 16..23).
  - Verify keyboard navigation: Tab to `DropZone`, press `Enter` -> assert `filechooser` event fires.
  - Open `SettingsModal`: assert `[role="dialog"][aria-modal="true"]`, press `Escape` -> dialog closes; re-open and click backdrop -> dialog closes.
  - Compute luminance contrast for muted text elements against computed background (`>= 4.5:1`).
  - Emulate `reducedMotion: "reduce"` -> verify computed `animationDuration` is `0.01ms` or `0s`.

- [ ] **Step 3: Run full Phase 1 verification gate**
  Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`
  Expected: All lint, typecheck, Vitest, build, and Playwright E2E checks PASS.

- [ ] **Step 4: Commit**
  ```bash
  git add tests/e2e/
  git commit -m "test(phase1): add Playwright E2E suites for conversions, COEP, leaks, brand, and a11y"
  ```

---

## Phase 2 — Core Engines, Instrument UI Rebuild & Remote Delivery

### Task 7: Mediabunny / WebCodecs Video Trim & Compress + FFmpeg WASM Fallback

**Files:**
- Modify: `package.json` (`mediabunny`)
- Modify: `src/types/converter.ts`
- Create: `src/lib/converters/webcodecsMedia.ts`
- Modify: `src/lib/converters/mediaConverter.ts`
- Test: `tests/unit/mediaConverter.test.ts`

**Interfaces:**
- Produces:
  - `validateTrimRange(trimStart?: number | null, trimEnd?: number | null): { start?: number; end?: number }`
  - `probeWebCodecsSupport(targetFormat: string, dims?: { width?: number | null; height?: number | null; bitrate?: number }): Promise<boolean>`
  - `transcodeWithMediabunny(file: File, targetFormat: string, settings: ConversionSettings, onProgress?: (pct: number) => void): Promise<Blob>`
  - `buildFfmpegArgs(inputName: string, outputName: string, targetFormat: string, settings: ConversionSettings): string[]`
  - `transcodeMediaWithInfo(file: File, targetFormat: string, settings: ConversionSettings, onProgress?: (pct: number) => void): Promise<{ blob: Blob; engine: "webcodecs" | "ffmpeg" }>`
  - `transcodeMedia(...)` (preserved `Promise<Blob>` wrapper)

- [ ] **Step 1: Install `mediabunny@^1.66.5`**
  Run: `npm install mediabunny@^1.66.5`
  Expected: `mediabunny` installed in `package.json`.

- [ ] **Step 2: Write failing unit tests in `tests/unit/mediaConverter.test.ts`**
  - `test_validateTrimRange_rejects_inverted_range`: `validateTrimRange(5, 3)` throws `/Trim end must be greater than trim start/i`; negative values clamp/throw cleanly.
  - `test_buildFfmpegArgs_includes_trim_height_only_scale_and_crf`: verifies `buildFfmpegArgs("in.mp4", "out.mp4", "mp4", { quality: 80, width: null, height: 720, maintainAspectRatio: true, trimStart: 1.5, trimEnd: 4.5, videoQualityPreset: "compact" })` includes `"-ss"`, `"1.5"`, `"-to"`, `"4.5"`, `"-vf"`, `"scale=-2:720"`, `"-crf"`, `"32"`.
  - `test_transcodeMediaWithInfo_falls_back_to_ffmpeg_when_webcodecs_unavailable`: mocks `probeWebCodecsSupport` returning `false` (and separately mocks Mediabunny throwing) -> asserts FFmpeg path executes and returns `{ blob, engine: "ffmpeg" }`, and verifies non-zero `ffmpeg.exec` exit codes throw an explicit error.
  - `test_transcodeMediaWithInfo_uses_webcodecs_when_supported`: mocks `probeWebCodecsSupport` returning `true` and `transcodeWithMediabunny` -> asserts `{ blob, engine: "webcodecs" }`.

- [ ] **Step 3: Run unit test to verify it fails**
  Run: `npx vitest run tests/unit/mediaConverter.test.ts`
  Expected: FAIL.

- [ ] **Step 4: Implement `src/types/converter.ts`, `src/lib/converters/webcodecsMedia.ts`, and `src/lib/converters/mediaConverter.ts`**
  - `types/converter.ts`: add `VideoQualityPreset = "high" | "balanced" | "compact"`, `trimStart`, `trimEnd`, `videoQualityPreset`, `videoBitrateMbps`, `stripExif`, `sourceDimensions`, `durationSec`, `exifInfo`, `engineUsed`.
  - `webcodecsMedia.ts`: wrap `mediabunny` (`Input`, `BlobSource`, `ALL_FORMATS`, `Output`, `Mp4OutputFormat`, `WebMOutputFormat`, `MovOutputFormat`, `BufferTarget`, `Conversion`, `canEncodeVideo`) with bitrate mapping (`high`: 5 Mbps, `balanced`: 2.5 Mbps, `compact`: 1 Mbps or custom `videoBitrateMbps`) and trim `{ start, end }`.
  - `mediaConverter.ts`: implement `validateTrimRange`, `buildFfmpegArgs` (supporting trim, width-only, height-only, aspect-safe scaling, and CRF), and `transcodeMediaWithInfo` (attempts Mediabunny for `mp4`/`webm`/`mov` when `probeWebCodecsSupport` is `true`, transparently falling back to self-hosted FFmpeg WASM if unsupported or on runtime encode error). Inside the FFmpeg path, generate virtual FS `inputName`/`outputName` with a unique suffix (`crypto.randomUUID()` or monotonic counter) to avoid collisions, check `const exitCode = await ffmpeg.exec(args); if (exitCode !== 0) throw new Error(\`FFmpeg transcode failed with exit code \${exitCode}\`);`, and delete both temp files in `finally`.

- [ ] **Step 5: Run unit tests to verify pass**
  Run: `npx vitest run tests/unit/mediaConverter.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add package.json package-lock.json src/types/converter.ts src/lib/converters/webcodecsMedia.ts src/lib/converters/mediaConverter.ts tests/unit/mediaConverter.test.ts
  git commit -m "feat(phase2): add Mediabunny WebCodecs trim/compress engine with FFmpeg WASM fallback"
  ```

---

### Task 8: EXIF Metadata Scanner & Binary Stripper Engine

**Files:**
- Create: `src/lib/converters/exif.ts`
- Modify: `src/lib/converters/imageConverter.ts`
- Test: `tests/unit/exif.test.ts`

**Interfaces:**
- Produces:
  - `inspectImageMetadata(blob: Blob): Promise<ExifInfo>` (`{ hasExif: boolean; hasXmp: boolean; markers: string[]; orientation?: number }`)
  - `stripJpegBinaryMetadata(bytes: Uint8Array): Uint8Array`

- [ ] **Step 1: Write failing unit tests in `tests/unit/exif.test.ts`**
  - `test_inspectImageMetadata_detects_APP1_EXIF_and_orientation_in_jpeg`: passes `photo-exif.jpg` fixture (and a JPEG with IFD0 `Orientation = 6`) -> returns `{ hasExif: true, orientation: 6, markers: expect.arrayContaining(["APP1/EXIF"]) }`.
  - `test_stripJpegBinaryMetadata_removes_APP1_and_COM_preserving_SOI_and_EOI`: strips `photo-exif.jpg` bytes -> verifies output starts with `0xFF 0xD8`, ends with `0xFF 0xD9`, contains zero `0xFFE1` / `"Exif"` bytes, and `inspectImageMetadata` on stripped blob returns `hasExif: false`.
  - `test_inspectImageMetadata_detects_PNG_eXIf_chunk`: crafts minimal PNG with `eXIf` chunk -> returns `hasExif: true`.
  - `test_convertImage_rotated_exif_jpeg_bypasses_binary_fast_path_and_bakes_orientation`: verifies a JPEG with `Orientation = 6` (`quality >= 98`, no resize, `stripExif: true`) does NOT take `stripJpegBinaryMetadata` and instead decodes via `createImageBitmap(..., { imageOrientation: "from-image" })` + Canvas re-encode.

- [ ] **Step 2: Run unit test to verify it fails**
  Run: `npx vitest run tests/unit/exif.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/converters/exif.ts` and integrate into `src/lib/converters/imageConverter.ts`**
  - `exif.ts`: implement JPEG marker parser (`0xFFE1` APP1 EXIF/XMP, `0xFFED` IPTC, `0xFFFE` COM) + TIFF IFD0 `0x0112` (`Orientation`) tag parser (`"II"` little-endian and `"MM"` big-endian), PNG chunk scanner (`eXIf`, `tEXt`, `iTXt`, `zTXt`), WebP RIFF chunk scanner (`EXIF`, `XMP `), and lossless `stripJpegBinaryMetadata` removing `0xFFE1`, `0xFFED`, `0xFFFE` segments cleanly before `0xFFDA` (Start of Scan) — using `DataView` and explicit bounds/nullish checks (`?? 0`) for `noUncheckedIndexedAccess` compliance.
  - `imageConverter.ts`: inspect EXIF metadata (including `orientation`) first; pass `{ imageOrientation: "from-image" }` to `createImageBitmap`; only take the lossless `stripJpegBinaryMetadata` fast-path when `settings.stripExif !== false`, source is JPEG targeting `jpeg`/`jpg`, `!settings.width && !settings.height && settings.quality >= 98`, **and** EXIF `orientation` is absent or `1` (`!exifInfo.orientation || exifInfo.orientation === 1`); whenever `orientation > 1`, decode via `createImageBitmap(..., { imageOrientation: "from-image" })` and Canvas re-encode so rotated smartphone JPEGs are never saved sideways; when `settings.stripExif === false` and source matches target with no resize and `quality === 100`, return original blob untouched; otherwise Canvas re-encode strips metadata natively.

- [ ] **Step 4: Run unit tests to verify pass**
  Run: `npx vitest run tests/unit/exif.test.ts tests/unit/imageConverter.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/converters/exif.ts src/lib/converters/imageConverter.ts tests/unit/exif.test.ts
  git commit -m "feat(phase2): add binary EXIF metadata scanner and lossless/canvas EXIF stripper"
  ```

---

### Task 9: Folder Drop (`webkitdirectory`), Queue Thumbnails, 10 Legacy Presets, Custom W/H & Video/EXIF SettingsModal

**Files:**
- Create: `src/types/react.d.ts`
- Create: `src/lib/utils/folderDrop.ts`
- Create: `src/components/converter/JobThumbnail.tsx`
- Modify: `src/components/converter/DropZone.tsx`
- Modify: `src/components/converter/SettingsModal.tsx`
- Test: `tests/unit/folderDrop.test.ts`

**Interfaces:**
- Produces:
  - `extractDroppedFiles(dataTransfer: DataTransfer): Promise<File[]>` and `filterValidDroppedFiles(files: File[]): File[]`
  - `RESOLUTION_PRESETS` (exact 10 presets from `legacy/app.js:3-14`)
  - `<JobThumbnail file={job.file} category={job.category} inputFormat={job.inputFormat} />`

- [ ] **Step 1: Write failing unit tests in `tests/unit/folderDrop.test.ts`**
  - `test_filterValidDroppedFiles_excludes_hidden_dotfiles_and_zero_byte_files`: verifies `.DS_Store`, `.gitignore`, and `0`-byte `empty.png` are filtered out while valid files remain.
  - `test_extractDroppedFiles_traverses_nested_directory_entries`: mocks `DataTransferItem.webkitGetAsEntry()` with nested `FileSystemDirectoryEntry` returning batches of entries before `[]`, asserting all nested valid files are flattened.

- [ ] **Step 2: Run unit test to verify it fails**
  Run: `npx vitest run tests/unit/folderDrop.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `src/types/react.d.ts`, `folderDrop.ts`, `DropZone.tsx`, `JobThumbnail.tsx`, and `SettingsModal.tsx`**
  - `src/types/react.d.ts`: augment `"react"` (`declare module "react" { interface InputHTMLAttributes<T> { webkitdirectory?: string; directory?: string; } }`) so JSX `webkitdirectory=""` / `directory=""` passes `npx tsc --noEmit` cleanly under `@types/react@19.0.1` + `strict: true`.
  - `folderDrop.ts`: implement `readDirectoryEntries` (looping `reader.readEntries` until empty) and `filterValidDroppedFiles`.
  - `DropZone.tsx`: add secondary `"Select Folder"` button + hidden `<input type="file" multiple ref={folderInputRef} webkitdirectory="" directory="" />` (and/or reinforce via `useEffect` `folderInputRef.current?.setAttribute("webkitdirectory", "")` so `[webkitdirectory]` is guaranteed in the DOM for Task 11 E2E) and `e.stopPropagation()`; upgrade `handleDrop` to await `extractDroppedFiles(e.dataTransfer)`.
  - `JobThumbnail.tsx`: `48×48` (`w-12 h-12`) thumbnail creating/revoking object URL via `useEffect` cleanup for previewable images/videos, falling back to extension badge for HEIC/PDF/Audio.
  - `SettingsModal.tsx`: restore all 10 `RESOLUTION_PRESETS`; add numeric `Width` and `Height` inputs synced with `maintainAspectRatio` lock and `sourceDimensions`; add Video Trim (`Trim Start (s)`, `Trim End (s)`, validated against `durationSec`) + compression preset (`High`, `Balanced`, `Compact`) + `WEBCODECS HW` / `FFMPEG WASM` capability badge; add Image **Strip EXIF Metadata** toggle (`stripExif`, default `true`) with honest Canvas conversion note.

- [ ] **Step 4: Run unit tests & `tsc --noEmit`**
  Run: `npx vitest run tests/unit/folderDrop.test.ts && npm run typecheck`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/types/react.d.ts src/lib/utils/folderDrop.ts src/components/converter/DropZone.tsx src/components/converter/JobThumbnail.tsx src/components/converter/SettingsModal.tsx tests/unit/folderDrop.test.ts
  git commit -m "feat(phase2): add folder drop, queue thumbnails, 10 legacy presets, custom W/H, trim, and EXIF UI"
  ```

---

### Task 10: Before/After Visual Diff Slider, NumberFlow Telemetry & Teenage Engineering / Cobalt Instrument UI

**Files:**
- Modify: `package.json` (`@number-flow/react`)
- Create: `src/components/converter/VisualDiffModal.tsx`
- Create: `src/components/converter/SavingsTelemetry.tsx`
- Modify: `src/app/layout.tsx` (`JetBrains_Mono` font)
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/converter/FileQueue.tsx`
- Modify: `src/components/converter/ActionToolbar.tsx`
- Modify: `src/components/converter/ConverterWorkspace.tsx`

**Interfaces:**
- Produces:
  - `<VisualDiffModal job={diffJob} onClose={() => setDiffJob(null)} />` (`role="dialog"`, `role="slider"`, `clip-path` split)
  - `<SavingsTelemetry totalInputBytes={...} totalOutputBytes={...} />` using `@number-flow/react`

- [ ] **Step 1: Install `@number-flow/react@^0.6.2`**
  Run: `npm install @number-flow/react@^0.6.2`
  Expected: Installed cleanly with React 19 compatibility.

- [ ] **Step 2: Implement `VisualDiffModal.tsx` and `SavingsTelemetry.tsx`**
  - `VisualDiffModal.tsx`: loads `URL.createObjectURL(job.file)` on open (revoked on close) alongside `job.outputFiles[0].url`, renders split comparison with `role="slider"` (`aria-valuemin={0}`, `aria-valuemax={100}`, `aria-valuenow={splitPct}`), pointer drag + Left/Right arrow keys (`Shift` = 10%), and original vs. output byte & format readout.
  - `SavingsTelemetry.tsx`: `"use client"` component rendering `<NumberFlow />` for output KB/MB and percentage saved (`tabular-nums`, `font-mono`), disabling motion when `prefers-reduced-motion: reduce` matches.

- [ ] **Step 3: Apply Teenage Engineering / Cobalt Acid Instrument UI across workspace & layout**
  - Add `JetBrains_Mono` (`--font-mono`) in `src/app/layout.tsx` and `fontFamily.mono` + `cobalt` (`#2563eb`, `#60a5fa`) tokens in `tailwind.config.ts`.
  - Refine `globals.css`, `page.tsx`, `Header.tsx`, `FileQueue.tsx`, `ActionToolbar.tsx`, and `ConverterWorkspace.tsx` with structural `1px` hairline frames (`<= 12px` radius), monospace step headers (`01 // INPUT`, `02 // QUEUE`, `03 // TELEMETRY`), Cobalt hardware badges (`WEBCODECS HW` / `WASM`), `EXIF` / `STRIPPED` badges, row-level byte delta + `Compare` button (`VisualDiffModal`), batch `SavingsTelemetry`, and metadata scanning (`inspectImageMetadata` + image/video dimensions/duration on file add).

- [ ] **Step 4: Run lint, typecheck, unit tests, and production build**
  Run: `npm run lint && npm run typecheck && npm test && npm run build`
  Expected: Zero errors across all 4 checks.

- [ ] **Step 5: Commit**
  ```bash
  git add package.json package-lock.json src/
  git commit -m "feat(phase2): add Visual Diff Slider, NumberFlow telemetry, and Cobalt/Acid instrument UI"
  ```

---

### Task 11: Phase 2 Playwright E2E Suite, Full Local Gate, GitHub Push & Vercel Deployment

**Files:**
- Create: `tests/e2e/phase2-features.spec.ts`

**Interfaces:**
- Verifies: Complete Phase 1 + Phase 2 suite locally, on `origin/main`, and live at `https://pixyshift.vercel.app`.

- [ ] **Step 1: Write `tests/e2e/phase2-features.spec.ts`**
  - **Before/After Visual Diff Slider:** Convert `sample.png` to `webp`, click `Compare`, verify `[role="dialog"]` and `[role="slider"]`, press `ArrowRight` / drag slider -> verify `aria-valuenow` updates and dialog closes cleanly on `Escape`.
  - **NumberFlow Size Savings Telemetry:** After converting `sample.png` (or `transparent-large.png`) -> `webp`, assert row-level and batch telemetry render non-empty byte savings & percentage text.
  - **EXIF Stripper:** Upload `photo-exif.jpg`, verify `EXIF` badge appears; convert to `jpeg` with Strip EXIF enabled, capture downloaded bytes -> assert zero `0xFFE1` / `"Exif"` bytes remain (`STRIPPED` badge shown).
  - **Custom W/H, 10 Legacy Presets & Thumbnails:** Open `SettingsModal` on an image -> assert all 10 presets (`Original`, `320×240`, `480p`, `640×480`, `720p`, `800×600`, `1080p`, `1440p`, `2048p`, `4K UHD`) render, enter custom `Width=200` with aspect lock -> verify `Height` updates proportionally and conversion output matches; verify `<img src="blob:...">` queue thumbnail renders (`naturalWidth > 0`).
  - **Video Trim & Compress Controls:** Upload the deterministic synthetic `tests/fixtures/generated/sample.webm` clip, verify video metadata loads (`duration > 0`), open `SettingsModal` and configure `Trim Start`, `Trim End`, and compression preset (`Balanced` / `Compact`), verify the capability badge (`WEBCODECS HW` or `FFMPEG WASM`) renders, close settings, click Convert All, and verify the video job completes (`Done`) with a non-empty output blob/download and zero console/page errors.
  - **Folder Upload (`webkitdirectory`):** Set files on the hidden `[webkitdirectory]` input using `tests/fixtures/generated/folder-drop/` -> verify `nested.png` queues while `.DS_Store` and `empty.png` are skipped.
  - Assert zero `pageerror` and zero `console.error` events across the entire E2E session.

- [ ] **Step 2: Run the complete verification gate locally**
  Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`
  Expected: Zero errors across lint, TypeScript, Vitest, Next.js build, and all Playwright Phase 1 + Phase 2 specs.

- [ ] **Step 3: Commit any remaining test/doc updates, push to GitHub (`origin/main`), and deploy to Vercel (`pixyshift`)**
  ```bash
  git add tests/e2e/phase2-features.spec.ts
  git commit -m "test(phase2): add Playwright E2E coverage for diff slider, telemetry, EXIF, presets, and folder drop"
  git push origin main
  npx vercel --prod --yes
  ```
  Verify `https://pixyshift.vercel.app` returns HTTP 200 and `/opengraph-image` returns HTTP 200 `image/png`.

---

## Self-Review Results

1. **Spec Coverage:** Every requirement in `docs/superpowers/specs/2026-11-27-pixshift-unified-design.md` (R2.1–R2.7, R3 brand/copy/OG/WCAG AA/a11y/CSS/tooling/CI, R4 diff slider/NumberFlow/Mediabunny+FFmpeg/EXIF/10 presets+W/H+thumbnails+folder drop/Instrument UI, R5 GitHub push + Vercel deploy) maps directly to Tasks 1–11.
2. **Step Scan:** Every task specifies exact file paths, exported function signatures, test names, assertions, and verification commands with no ambiguous `"TBD"` or `"handle edge cases"` placeholders.
3. **Type Consistency:** `FileDetectionResult`, `encodeBmpFromImageData`, `encodeIcoFromPngBytes`, `supportsAvifEncoding`, `deduplicateArchivePath`, `validateTrimRange`, `buildFfmpegArgs`, `transcodeMediaWithInfo`, `inspectImageMetadata`, `stripJpegBinaryMetadata`, `ConversionSettings`, and `ConversionJob` match identically across all tasks.
4. **Review Focus:** All 5 high-risk edge cases (stale `mergeToPdf` reset, oversized/transparent `.ico`/`.bmp`, unsupported canvas AVIF, invalid video trim/WebCodecs fallback, and folder dotfiles + colliding `.zip` paths) are pinned to specific tests in Tasks 2, 4, 6, 7, and 9.
5. **Proportion:** Concise architectural contract (~370 lines) rather than a full source-code transcript.
