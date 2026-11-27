# Pixshift — Universal In-Browser File Converter

> **100% Client-Side · Zero Server Uploads · WebCodecs & Self-Hosted WebAssembly · Free Forever**

Pixshift converts images, video, audio, and PDFs directly inside your browser. No files are uploaded to any server because decoding, transcoding, resizing, EXIF stripping, and ZIP packaging execute locally on your device.

---

## Features

- **Large-Batch & Folder Workbench:** Recursive nested folder drops (`webkitdirectory`), immediate Mass Control Bar (`>10` files or nested folders), folder-scoped filtering, deterministic batch rename patterns, windowed 60fps queue virtualization, live `@number-flow/react` throughput/savings telemetry, and ZIP export with **Preserve Folders** or **Flatten Root** modes.
- **Images & Smart Compression Studio:** Worker-pool `OffscreenCanvas` transforms supporting PNG, JPEG/JPG, WebP, AVIF (capability-gated), BMP (24-bit `BI_RGB`), ICO (Vista+ PNG-in-ICO up to 256×256), HEIC/HEIF (`heic2any`), auto target-size KB compression, rotate/flip/crop geometry edits, text/image watermarks, live format savings advisor, visual diff slider, and orientation-aware EXIF stripping.
- **Video-to-GIF Studio & Audio Trim:** Hardware-accelerated WebCodecs trim and compression (`mediabunny`) with automatic fallback to self-hosted `@ffmpeg/ffmpeg` WASM, plus dedicated GIF Studio (timeline trim, FPS, scale, loop count, reverse toggle, caption overlay, live preview) and audio trim/bitrate controls.
- **PDF Page Studio & OCR:** Visual thumbnail page reordering, rotation, removal, range splitting, multi-PDF/image merging (`pdf-lib` + self-hosted `pdfjs-dist`), plus self-hosted offline `tesseract.js` OCR for images and PDFs.
- **Offline-First PWA & Anonymous Sharing:** Custom `COOP`/`COEP`-compliant Service Worker (`sw.js`) with optional offline WASM cache prewarming, OS `file_handlers` + `share_target`, and dual-mode anonymous output sharing (Native OS Share / Serverless WebRTC P2P QR drop + client-side `AES-256-GCM` 24h encrypted links where keys remain solely in URL `#fragment`).

---

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript (`strict` + `noUncheckedIndexedAccess`)
- **Styling:** Tailwind CSS 3 (`#0a0a0b` matte instrument chassis, `#c8f03c` acid lime, `#60a5fa` cobalt)
- **Media, OCR & Documents:** `mediabunny`, `@ffmpeg/ffmpeg` + `@ffmpeg/core` (self-hosted), `tesseract.js` + `@tesseract.js-data/eng` (self-hosted), `pdf-lib`, `pdfjs-dist` (self-hosted worker), `heic2any`, `jszip`, `@number-flow/react`, `@vercel/blob`
- **Quality Gate:** ESLint 9, Vitest (56+ tests), Playwright (19+ Chromium E2E tests against production `next start` with `COOP`/`COEP`)

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
