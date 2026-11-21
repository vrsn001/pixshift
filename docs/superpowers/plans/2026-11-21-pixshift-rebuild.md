# Pixshift Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Pixshift into a universal, CloudConvert-style in-browser file converter (Images, Video, Audio, and PDFs) running 100% client-side via Web Workers, WebAssembly, and Next.js 15.

**Architecture:** Next.js 15 App Router with TypeScript and Tailwind CSS. Modular client-side conversion pipeline: OffscreenCanvas + decoders for images, `@ffmpeg/ffmpeg` WASM in dedicated Web Workers for audio/video, `pdf-lib` and `pdfjs-dist` for documents, and JSZip for archive bundling. CloudConvert-inspired interactive queue UI adhering to the Impeccable design system.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide React, JSZip, `@ffmpeg/ffmpeg`, `@ffmpeg/util`, `pdf-lib`, `pdfjs-dist`, `heic2any`.

**Spec:** `docs/superpowers/specs/2026-11-21-pixshift-rebuild-design.md`

## Global Constraints

- Must run 100% in-browser with zero server uploads.
- Project location on disk: `C:\Users\HP\Pixshift` (separate standalone directory).
- Git remote tracks `https://github.com/vrsn001/pixshift`.
- Preserves Vercel project linkage (`pixyshift` / `prj_k1PSCy3JyYKrMnCxMMUAxcqFZJPA`).
- Next.js configured with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for multi-threaded WASM support.
- Heavy conversion workloads must run inside Web Workers to ensure 60 FPS UI responsiveness.

## Review Focus

1. **Very Large Media Files (>200MB):** Video transcoding memory exhaustion in WASM — ensure buffers are freed immediately after blob creation.
2. **Missing Cross-Origin Isolation:** In browsers or embedding scenarios where COOP/COEP headers cannot be applied — ensure single-threaded fallback or clear user guidance.
3. **Apple HEIC/HEIF Format:** iPhone camera uploads — verify `heic2any` decodes EXIF rotation correctly before canvas rendering.
4. **Multi-Page PDF to Image Archive:** PDF with multiple pages — verify single-file download produces a `.zip` while batch "Download All" avoids nested archive corruption.
5. **Mixed Batch Queues:** Queue containing images, MP3s, and MP4s simultaneously — ensure "Convert All" orchestrates disparate workers cleanly without race conditions.

---

### Task 1: Project Scaffolding & Repository Setup at `C:\Users\HP\Pixshift`

**Files:**
- Create: `C:\Users\HP\Pixshift\package.json`
- Create: `C:\Users\HP\Pixshift\tsconfig.json`
- Create: `C:\Users\HP\Pixshift\next.config.ts`
- Create: `C:\Users\HP\Pixshift\postcss.config.mjs`
- Create: `C:\Users\HP\Pixshift\tailwind.config.ts`
- Create: `C:\Users\HP\Pixshift\.vercel\project.json`

**Interfaces:**
- Produces: Runnable Next.js 15 project at `C:\Users\HP\Pixshift` with TypeScript, Tailwind CSS, and WASM headers.

- [ ] **Step 1: Initialize directory structure and preserve git & Vercel configs**
  Copy git tracking and `.vercel/project.json` from scratch repo to `C:\Users\HP\Pixshift`.
- [ ] **Step 2: Scaffold Next.js 15 application dependencies in `package.json`**
  Install `next@latest`, `react@latest`, `react-dom@latest`, `lucide-react`, `jszip`, `clsx`, `tailwind-merge`.
- [ ] **Step 3: Configure `next.config.ts` with COOP and COEP headers**
  Add async headers returning `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- [ ] **Step 4: Run build check to verify scaffolding**
  Run: `npm run build`
  Expected: Successful production build.
- [ ] **Step 5: Commit**
  ```bash
  git add .
  git commit -m "chore: scaffold Next.js 15 rebuild in C:\Users\HP\Pixshift"
  ```

---

### Task 2: Core Conversion Types, Registry & File Detection Engine

**Files:**
- Create: `src/types/converter.ts`
- Create: `src/lib/converters/registry.ts`
- Create: `src/lib/converters/detector.ts`
- Test: `tests/detector.test.ts`

**Interfaces:**
- Produces:
  - `detectCategory(file: File): FileCategory` ('image' | 'video' | 'audio' | 'document')
  - `getAvailableOutputs(category: FileCategory, inputExt: string): SupportedFormat[]`
  - `ConversionJob` interface with status, progress, settings, and output payload.

- [ ] **Step 1: Write failing unit test for file detection and format matrix**
  Test detecting MIME/extension for `.heic`, `.webp`, `.mp4`, `.mp3`, `.pdf` and matching valid target formats.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test tests/detector.test.ts`
  Expected: FAIL with missing modules.
- [ ] **Step 3: Implement `src/types/converter.ts` and `src/lib/converters/detector.ts`**
  Implement comprehensive MIME-to-format mapping and target compatibility tables.
- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test tests/detector.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/types/converter.ts src/lib/converters/ tests/
  git commit -m "feat: add format detection and conversion registry"
  ```

---

### Task 3: Client-Side Image Conversion Engine (Canvas + WASM + HEIC)

**Files:**
- Create: `src/lib/converters/imageConverter.ts`
- Create: `src/lib/converters/heicDecoder.ts`
- Test: `tests/imageConverter.test.ts`

**Interfaces:**
- Consumes: `ConversionJob`, `ConversionSettings` from `src/types/converter.ts`.
- Produces: `convertImage(file: File, targetFormat: string, settings: ConversionSettings): Promise<Blob>`

- [ ] **Step 1: Write failing test for image conversion**
  Test converting 100x100 canvas PNG blob to WebP, JPEG, and resized dimensions.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test tests/imageConverter.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement `src/lib/converters/imageConverter.ts`**
  Implement `OffscreenCanvas` rendering, dimension resizing with aspect ratio math, quality compression scaling, and HEIC decoding via dynamic import of `heic2any`.
- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test tests/imageConverter.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/converters/imageConverter.ts tests/
  git commit -m "feat: implement high-performance client-side image converter"
  ```

---

### Task 4: WebAssembly Media Worker (Video & Audio Transcoding via FFmpeg)

**Files:**
- Create: `src/workers/ffmpegWorker.ts`
- Create: `src/lib/converters/mediaConverter.ts`
- Test: `tests/mediaConverter.test.ts`

**Interfaces:**
- Consumes: `@ffmpeg/ffmpeg`, `@ffmpeg/util`.
- Produces: `transcodeMedia(file: File, targetFormat: string, settings: ConversionSettings, onProgress: (pct: number) => void): Promise<Blob>`

- [ ] **Step 1: Write failing test for worker protocol**
  Test message dispatching and progress event listener contracts.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test tests/mediaConverter.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement Web Worker and controller in `src/workers/ffmpegWorker.ts` and `src/lib/converters/mediaConverter.ts`**
  Implement dynamic loading of FFmpeg WASM binaries, input virtual filesystem writing, execution of transcode commands (`-vn -b:a 192k` for audio extraction, scale filters for video resize, palettegen for GIF), and progress tracking.
- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test tests/mediaConverter.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/workers/ src/lib/converters/mediaConverter.ts tests/
  git commit -m "feat: add FFmpeg WASM worker for client-side audio/video transcoding"
  ```

---

### Task 5: PDF & Document Conversion Engine

**Files:**
- Create: `src/lib/converters/documentConverter.ts`
- Test: `tests/documentConverter.test.ts`

**Interfaces:**
- Produces:
  - `mergeImagesToPdf(files: File[]): Promise<Blob>`
  - `extractPdfToImages(file: File, format: 'png' | 'jpeg'): Promise<{ name: string; blob: Blob }[]>`

- [ ] **Step 1: Write failing test for PDF merge and extraction**
  Test merging two image buffers into a valid PDF document.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test tests/documentConverter.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement `src/lib/converters/documentConverter.ts`**
  Implement `pdf-lib` document assembly and `pdfjs-dist` viewport canvas rendering.
- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test tests/documentConverter.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/lib/converters/documentConverter.ts tests/
  git commit -m "feat: implement PDF merging and page extraction"
  ```

---

### Task 6: Impeccable Design System Shell & Layout

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/components/Header.tsx`
- Create: `src/components/Footer.tsx`
- Create: `src/components/PrivacyBanner.tsx`
- Create: `src/components/Faq.tsx`

**Interfaces:**
- Produces: Responsive, accessible application frame with dark glassmorphic styling, typography tokens, and privacy messaging.

- [ ] **Step 1: Configure global CSS and design tokens in `src/app/globals.css`**
  Set up dark slate/obsidian palette, luminous accents, glassmorphic card utilities, custom scrollbar.
- [ ] **Step 2: Build `Header.tsx` with logo, navigation, and Vercel/GitHub badges**
  Pixshift branding with Syne/Geist font styling and instant status pill.
- [ ] **Step 3: Build `PrivacyBanner.tsx` and `Faq.tsx`**
  Clear, elegant explanations of 100% in-browser processing and format compatibility.
- [ ] **Step 4: Verify layout rendering**
  Run: `npm run build`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/app/ src/components/
  git commit -m "feat: build Impeccable dark glassmorphic layout and header"
  ```

---

### Task 7: CloudConvert-Style Conversion Dashboard & Queue UI

**Files:**
- Create: `src/components/converter/DropZone.tsx`
- Create: `src/components/converter/FileQueue.tsx`
- Create: `src/components/converter/FormatSelector.tsx`
- Create: `src/components/converter/SettingsModal.tsx`
- Create: `src/components/converter/ActionToolbar.tsx`
- Create: `src/lib/utils/archive.ts`
- Create: `src/app/page.tsx`
- Test: `tests/queueUi.test.tsx`

**Interfaces:**
- Connects: User interactions (drag-and-drop, format pick, settings tweak, batch trigger) with conversion orchestrator and JSZip download.

- [ ] **Step 1: Write integration test for file queue additions and format selection**
  Test dropping a file into queue, selecting target format, and verifying state update.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test tests/queueUi.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Implement `DropZone.tsx`, `FileQueue.tsx`, `FormatSelector.tsx`, and `SettingsModal.tsx`**
  Build drag-and-drop handler with paste support, individual queue item rows with progress bars, and modal controls for quality/resolution.
- [ ] **Step 4: Implement `ActionToolbar.tsx` and `archive.ts`**
  Wire "Convert All", "Merge images to single PDF", and JSZip "Download All (.zip)".
- [ ] **Step 5: Connect complete converter app in `src/app/page.tsx`**
  Full reactive state management with error boundaries and smooth CSS transitions.
- [ ] **Step 6: Run test to verify it passes**
  Run: `npm test tests/queueUi.test.tsx`
  Expected: PASS.
- [ ] **Step 7: Commit**
  ```bash
  git add src/components/converter/ src/lib/utils/ src/app/page.tsx tests/
  git commit -m "feat: complete CloudConvert-style interactive queue and batch actions"
  ```

---

### Task 8: Verification, Documentation, and Vercel Deployment Check

**Files:**
- Modify: `README.md`
- Modify: `vercel.json`

**Interfaces:**
- Produces: Production-verified project ready for `git push` to GitHub and automatic Vercel deployment.

- [ ] **Step 1: Run complete test suite and linter**
  Run: `npm test && npm run lint`
  Expected: All tests pass with zero lint errors.
- [ ] **Step 2: Run production Next.js build**
  Run: `npm run build`
  Expected: Static pages & worker chunks compiled successfully.
- [ ] **Step 3: Update `README.md` with comprehensive documentation**
  Highlight universal conversion features, architecture, and local development instructions.
- [ ] **Step 4: Final Git commit**
  ```bash
  git add .
  git commit -m "docs: finalize Pixshift rebuild documentation"
  ```
