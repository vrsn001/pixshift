# Pixshift (v2.0) — Universal In-Browser File Converter

> **100% Client-Side · Zero Server Uploads · WebAssembly Powered · Free Forever**

Pixshift is a universal, privacy-first file conversion studio that runs entirely in your browser. Unlike traditional converters like CloudConvert that enforce upload quotas, daily limits, or queue times, Pixshift performs all conversions locally on your hardware using multi-threaded **WebAssembly (FFmpeg, Libheif)**, **OffscreenCanvas**, and **Web Workers**.

---

## ✨ Features

- **Universal Multi-Format Support:**
  - **Images:** PNG, JPEG/JPG, WebP, AVIF, BMP, ICO, SVG, Apple HEIC/HEIF (`heic2any`).
  - **Video:** MP4 (H.264), WebM (VP9), MKV, AVI, MOV, FLV, animated GIF (with palettegen).
  - **Audio:** MP3, WAV, OGG, AAC, M4A, FLAC, and video-to-audio extraction (e.g., MP4 → MP3).
  - **Documents:** Multi-image to single PDF merging, and multi-page PDF page extraction to PNG/JPEG.
- **CloudConvert-Style Workflow:**
  - Drag-and-drop batch queue with intelligent format auto-detection and clipboard paste (Ctrl+V) support.
  - Per-file target format dropdown filtered by media category.
  - Granular conversion settings: quality slider (1-100%), resolution presets (Original, 720p, 1080p, 4K, custom), and audio bitrates.
  - Optional **"Merge images into single PDF"** toggle.
  - One-click **"Download All as ZIP"** packaging via JSZip.
- **Absolute Privacy & Zero Cost:**
  - No files ever leave your device.
  - No accounts, no paywalls, no daily limits.
  - 60 FPS non-blocking UI powered by dedicated Web Workers.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS (Obsidian/Slate dark glassmorphic theme)
- **Media Transcoding:** `@ffmpeg/ffmpeg` & `@ffmpeg/util` (WebAssembly)
- **Document Engine:** `pdf-lib` & `pdfjs-dist`
- **Image Processing:** HTML5 OffscreenCanvas, `heic2any`
- **Archiving:** `jszip`

---

## 🚀 Getting Started

### Local Development

1. **Clone & Install Dependencies:**
   ```bash
   git clone https://github.com/vrsn001/pixshift.git
   cd pixshift
   npm install
   ```

2. **Run Dev Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

3. **Production Build:**
   ```bash
   npm run build
   npm run start
   ```

---

## 📦 Deployment on Vercel

Pixshift is pre-configured for Vercel deployment with automatic `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers enabled in `next.config.ts` and `vercel.json` for multi-threaded WebAssembly:

```json
{
  "framework": "nextjs",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

Pushes to `main` automatically deploy to your connected Vercel project (`pixyshift`).

---

## 📄 License

Licensed under the Apache 2.0 License.
Built with ❤️ by [Laksh Rohilla](https://github.com/vrsn001).
