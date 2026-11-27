# Pixshift — Universal In-Browser File Converter

> **100% Client-Side · Zero Server Uploads · WebCodecs & Self-Hosted WebAssembly · Free Forever**

Pixshift converts images, video, audio, and PDFs directly inside your browser. No files are uploaded to any server because decoding, transcoding, resizing, EXIF stripping, and ZIP packaging execute locally on your device.

---

## Features

- **Images:** Convert PNG, JPEG/JPG, WebP, AVIF (capability-gated), BMP (true 24-bit BI_RGB), ICO (real Vista+ PNG-in-ICO up to 256×256), HEIC/HEIF (`heic2any`), and single/multi-image PDF export (`pdf-lib`).
- **Video & Audio:** Hardware-accelerated WebCodecs trim and compression via `mediabunny` (`mp4`, `webm`, `mov`) with automatic fallback to self-hosted `@ffmpeg/ffmpeg` WASM (`mp4`, `webm`, `mkv`, `avi`, `mov`, `gif`, `mp3`, `wav`, `ogg`, `aac`, `m4a`, `flac`).
- **Documents:** Extract multi-page PDFs into PNG or JPEG images using self-hosted `pdfjs-dist` workers, or merge multiple images into one ordered PDF.
- **Privacy & Controls:** Binary EXIF scanner/stripper (orientation-aware), before/after interactive Visual Diff Slider, NumberFlow byte-savings telemetry, custom dimensions with 10 resolution presets, queue thumbnails, recursive folder drop (`webkitdirectory`), and collision-safe ZIP archiving.

---

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript (`strict` + `noUncheckedIndexedAccess`)
- **Styling:** Tailwind CSS 3 (`#0a0a0b` matte instrument chassis, `#c8f03c` acid lime, `#60a5fa` cobalt)
- **Media & Documents:** `mediabunny`, `@ffmpeg/ffmpeg` + `@ffmpeg/core` (self-hosted), `pdf-lib`, `pdfjs-dist` (self-hosted worker), `heic2any`, `jszip`, `@number-flow/react`
- **Quality Gate:** ESLint 9, Vitest, Playwright (against production `next start` with `COOP`/`COEP`)

---

## Getting Started

1. **Install dependencies (automatically syncs self-hosted WASM/worker assets into `public/`):**
   ```bash
   npm install
   ```

2. **Run Dev Server:**
   ```bash
   npm run dev
   ```

3. **Run Checks:**
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   npm run test:e2e
   ```

---

## Deployment on Vercel

Pixshift sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` in `next.config.ts` and `vercel.json` so all WASM/worker modules run same-origin under strict isolation. Pushes to `main` deploy to the `pixyshift` Vercel project (`https://pixyshift.vercel.app`).

---

## License

Licensed under the Apache 2.0 License.
Built by [Laksh Rohilla](https://github.com/vrsn001).
