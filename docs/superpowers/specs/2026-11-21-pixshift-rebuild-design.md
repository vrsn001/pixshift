# Pixshift Rebuild Design Document: Universal In-Browser Converter

**Date:** 2026-11-21  
**Project:** Pixshift (rebuilt from `vrsn001/pixshift`)  
**Target Repository Path:** `C:\Users\HP\Pixshift`  
**Deployment Target:** Vercel (`pixyshift` / `prj_k1PSCy3JyYKrMnCxMMUAxcqFZJPA`)  
**Status:** Approved for Implementation Planning  

---

## 1. Intent and Why

Pixshift started as a browser-based WebP image converter. While functional, the original implementation is a legacy vanilla JS single-file script with UI quirks, canvas performance bottlenecks, and a narrow scope (WebP output only).

The goal of this rebuild is to transform Pixshift into a **modern, universal, CloudConvert-style conversion suite** ("convert any file into anything") that runs **100% in the user's browser**. By leveraging modern browser APIs (WebAssembly, OffscreenCanvas, Web Workers, and FFmpeg WASM), Pixshift delivers the utility of CloudConvert with none of the server costs, file size caps, queue delays, or privacy risks.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Universal Multi-Format Support:**
  - **Images:** PNG, JPEG/JPG, WebP, AVIF, BMP, ICO, SVG, and HEIC/HEIF (`heic2any`).
  - **Video:** MP4, WebM, MKV, AVI, MOV, and animated GIF (via WebAssembly FFmpeg).
  - **Audio:** MP3, WAV, OGG, AAC, M4A, FLAC, and video-to-audio extraction (e.g. MP4 → MP3).
  - **Documents:** PDF to image extraction (via `pdfjs-dist`), multi-image to PDF creation (via `pdf-lib`).
- **CloudConvert-Style Workflow:**
  - Multi-file drag-and-drop queue with intelligent file type detection.
  - Per-file target format dropdown filtered by media category (Image, Video, Audio, Document).
  - Configurable conversion settings: resolution scaling (Original, 720p, 1080p, 4K, custom), quality slider (1-100%), and audio bitrate.
  - Individual progress indicators (`Pending`, `Processing`, `Done`, `Failed`) with live percentage.
  - Individual download buttons and a global **"Download All (.zip)"** action using JSZip.
- **High Performance & Stability:**
  - Heavy conversions run in dedicated **Web Workers** so the UI never freezes or stutters.
  - Efficient memory management (Blob URLs revoked after download, canvas buffers cleaned).
- **Modern Developer Foundation:**
  - Built with **Next.js 15 (App Router)**, **React 19**, **TypeScript**, and **Tailwind CSS**.
  - Polished modern UI with Lucide icons, glassmorphic dark theme, responsive mobile support, and SEO meta tags.
- **Independent Git & Vercel Integration:**
  - Standalone project in `C:\Users\HP\Pixshift`, tracking `https://github.com/vrsn001/pixshift`.
  - Seamless auto-deploy to Vercel on push.

### Non-Goals
- User accounts, server databases, or saved cloud conversion history (Pixshift is strictly an instant, privacy-first utility).
- Heavy enterprise document conversions requiring proprietary server engines (e.g. DOCX-to-PDF pixel-perfect layout preservation).

### Anti-Goals
- **No Server Uploads:** User files must never be sent to any backend server. Everything executes locally on the client.
- **No Paywalls or Arbitrary Limits:** No artificial file size barriers or daily conversion quotas.
- **No Main-Thread Blocking:** Main thread must remain at 60 FPS while rendering or encoding.

---

## 3. Constraints

1. **Browser Capabilities:** Must run in modern evergreen browsers (Chrome, Edge, Firefox, Safari).
2. **WASM & Worker Isolation:** Multi-threaded FFmpeg requires `SharedArrayBuffer`, which mandates `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers configured in `next.config.js`. A single-threaded fallback must exist for environments where cross-origin isolation is not active.
3. **Vercel Hobby Tier:** Pixshift must deploy as a static/client-rendered Next.js app on Vercel without relying on long-running serverless compute functions.
4. **Local Workspace:** Project must reside in `C:\Users\HP\Pixshift` completely independent of `lakshay-portfolio`.

---

## 4. Evaluated Approaches & Selected Approach

| Approach | Architecture | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- | :--- |
| **Approach 1: Client-Side Modular Engine** | Next.js 15 + WASM (FFmpeg, Libheif) + Web Workers | 100% private, zero server costs, no Vercel timeout/payload limits, instant scale | High client RAM usage for huge files (>500MB) | **SELECTED** (by user) |
| **Approach 2: Hybrid Serverless** | Next.js + Vercel Serverless Functions (`sharp`, APIs) | Can run heavier server tasks | 10s execution timeout, 4.5MB upload limit, privacy loss | Rejected |
| **Approach 3: Static Vite SPA** | Vite + React + TypeScript | Lightweight, fast HMR | Lacks Next.js SEO metadata and easy edge header control | Rejected |

---

## 5. Technical Architecture & Module Design

### 5.1 System Architecture Diagram

```
+--------------------------------------------------------------------------+
|                            Next.js 15 UI Layer                           |
|  [DropZone] -> [File Queue] -> [Category Filtered Format Selector]      |
|  [Settings Modal] -> [Batch Actions: Convert All / Download All (.zip)]  |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
|                      Conversion Orchestration Controller                 |
|            Routes file by MIME/Extension to the appropriate worker        |
+--------------------------------------------------------------------------+
         |                                |                        |
         v                                v                        v
+---------------------+        +--------------------+    +-----------------+
| Image Worker        |        | FFmpeg WASM Worker |    | Document Engine |
| - OffscreenCanvas   |        | - Video-to-Video   |    | - pdf-lib       |
| - Canvas API        |        | - Video-to-Audio   |    | - pdfjs-dist    |
| - heic2any          |        | - Audio-to-Audio   |    |                 |
| - SVG rasterizer    |        | - Animated GIF     |    |                 |
+---------------------+        +--------------------+    +-----------------+
```

### 5.2 Supported Conversion Matrix

1. **Images:**
   - *Inputs:* PNG, JPG, JPEG, WebP, AVIF, BMP, ICO, SVG, HEIC, GIF
   - *Outputs:* WebP, PNG, JPEG, AVIF, BMP, ICO, PDF
2. **Video:**
   - *Inputs:* MP4, WebM, MKV, AVI, MOV, FLV
   - *Outputs:* MP4 (H.264), WebM (VP9), GIF (animated), MP3 (audio extraction), WAV
3. **Audio:**
   - *Inputs:* MP3, WAV, OGG, AAC, M4A, FLAC, WMA
   - *Outputs:* MP3, WAV, OGG, AAC, M4A
4. **Documents:**
   - *Inputs:* PDF, Images
   - *Outputs:* Images (PNG/JPEG per page), Combined PDF

---

## 6. Builder Review Decisions

Following architectural review, the following implementation decisions are codified:

1. **Conversion Queue Model & Multi-Image to PDF:**
   - Standard conversion is 1-to-1 per queue row.
   - When multiple images are loaded with target format `PDF`, a `"Merge images into single PDF"` toggle appears in the action toolbar. When toggled, the images are compiled in queue order into a single PDF document.
2. **Multi-Page PDF to Image Output:**
   - `ConversionJob` outputs an array of files `{ name: string, blob: Blob }[]`.
   - Single-row download: If 1 page, downloads the image directly; if multiple pages, downloads a `.zip` containing `page-1.png`, `page-2.png`, etc.
   - Global "Download All (.zip)": Automatically packages multi-page jobs into named subfolders inside the master archive.
3. **Settings Scope (Per-File vs. Global):**
   - Per-file settings by default via a wrench icon on each file row.
   - Inside the settings modal, an `"Apply settings to all compatible files"` button allows batch configuration across all images or videos in the queue.
4. **Document Scope:**
   - Focus on rock-solid PDF page extraction and Image-to-PDF merging. Heavyweight proprietary DOCX rendering is excluded to maintain browser performance and small bundle size.
