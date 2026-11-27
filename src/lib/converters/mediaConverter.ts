import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { ConversionSettings } from "@/types/converter";
import { probeWebCodecsSupport, resolveTargetBitrate, transcodeWithMediabunny } from "./webcodecsMedia";

let ffmpegInstance: FFmpeg | null = null;
let isLoaded = false;
let loadingPromise: Promise<FFmpeg> | null = null;
let jobCounter = 0;

export type MediaEngineUsed = "webcodecs" | "ffmpeg";

export interface ValidatedTrimRange {
  start?: number;
  end?: number;
}

/**
 * Validates trim start/end bounds cleanly before invoking WebCodecs or FFmpeg.
 */
export function validateTrimRange(
  trimStart?: number | null,
  trimEnd?: number | null
): ValidatedTrimRange {
  const result: ValidatedTrimRange = {};

  if (trimStart !== undefined && trimStart !== null) {
    if (!Number.isFinite(trimStart) || trimStart < 0) {
      throw new Error("Trim start must be non-negative.");
    }
    result.start = trimStart;
  }

  if (trimEnd !== undefined && trimEnd !== null) {
    if (!Number.isFinite(trimEnd) || trimEnd < 0) {
      throw new Error("Trim end must be non-negative.");
    }
    result.end = trimEnd;
  }

  if (result.start !== undefined && result.end !== undefined && result.end <= result.start) {
    throw new Error("Trim end must be greater than trim start.");
  }

  return result;
}

function presetToCrf(settings: ConversionSettings): string {
  switch (settings.videoQualityPreset) {
    case "high":
      return "20";
    case "compact":
      return "32";
    case "balanced":
      return "26";
    default: {
      if (settings.quality >= 90) return "20";
      if (settings.quality <= 55) return "32";
      return "26";
    }
  }
}

/**
 * Builds deterministic FFmpeg CLI arguments with trim, aspect-safe scaling, and CRF compression.
 */
export function buildFfmpegArgs(
  inputName: string,
  outputName: string,
  targetFormat: string,
  settings: ConversionSettings,
  captionOverlayName?: string
): string[] {
  const trim = validateTrimRange(settings.trimStart, settings.trimEnd);
  const args: string[] = [];

  if (trim.start !== undefined) {
    args.push("-ss", String(trim.start));
  }
  if (trim.end !== undefined) {
    args.push("-to", String(trim.end));
  }

  args.push("-i", inputName);

  const fmt = targetFormat.toLowerCase();
  const audioFormats = ["mp3", "wav", "ogg", "aac", "m4a", "flac"];

  if (audioFormats.includes(fmt)) {
    args.push("-vn");
    if (settings.audioBitrate) {
      args.push("-b:a", settings.audioBitrate);
    }
  } else if (fmt === "gif") {
    const fps = Math.max(1, Math.min(30, Math.round(settings.fps ?? 12)));
    const scaleWidth = settings.width && settings.width > 0 ? Math.round(settings.width) : 480;
    const loopCount =
      settings.gifLoop !== undefined && Number.isFinite(settings.gifLoop)
        ? Math.max(0, Math.round(settings.gifLoop))
        : 0;
    const revStep = settings.reverseGif ? ",reverse" : "";

    if (captionOverlayName) {
      args.push("-i", captionOverlayName);
      args.push(
        "-filter_complex",
        `[0:v]fps=${fps},scale=${scaleWidth}:-1:flags=lanczos${revStep}[base];[base][1:v]overlay=(W-w)/2:H-h-12,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`
      );
    } else {
      args.push(
        "-vf",
        `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos${revStep},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`
      );
    }
    args.push("-loop", String(loopCount));
  } else {
    if (settings.width && settings.height) {
      if (settings.maintainAspectRatio) {
        args.push(
          "-vf",
          `scale='min(${settings.width},iw)':'min(${settings.height},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`
        );
      } else {
        args.push("-vf", `scale=${settings.width}:${settings.height}`);
      }
    } else if (settings.width) {
      args.push("-vf", `scale=${settings.width}:-2`);
    } else if (settings.height) {
      args.push("-vf", `scale=-2:${settings.height}`);
    }

    const crf = presetToCrf(settings);
    if (fmt === "mp4" || fmt === "mov") {
      args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", crf);
    } else if (fmt === "webm") {
      args.push("-c:v", "libvpx-vp9", "-crf", crf, "-b:v", "0");
    }
  }

  args.push(outputName);
  return args;
}

/**
 * Lazily loads and initializes FFmpeg WebAssembly instance using self-hosted
 * assets under /public/ffmpeg/ to satisfy COEP: require-corp.
 */
export async function getFFmpegInstance(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");

    const ffmpeg = new FFmpeg();

    if (onLog) {
      ffmpeg.on("log", ({ message }: { message: string }) => onLog(message));
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const baseURL = "/ffmpeg";
    try {
      await ffmpeg.load({
        classWorkerURL: `${origin}${baseURL}/worker.js`,
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      isLoaded = true;
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (err) {
      loadingPromise = null;
      console.warn("Failed to load FFmpeg:", err);
      throw new Error("Could not initialize FFmpeg WebAssembly. Ensure your browser supports WebAssembly.");
    }
  })();

  return loadingPromise;
}

/**
 * Preloads FFmpeg WASM in the background.
 */
export function preloadFFmpeg(): void {
  getFFmpegInstance().catch(() => {
    // Silently fail on preload — will retry on actual conversion
  });
}

async function renderGifCaptionOverlayPng(
  caption: string,
  width: number
): Promise<Uint8Array | null> {
  const trimmed = caption.trim();
  if (!trimmed || typeof document === "undefined") return null;

  const canvasW = Math.max(200, Math.min(1280, Math.round(width || 480)));
  const fontSize = Math.max(16, Math.round(canvasW * 0.055));
  const canvasH = Math.round(fontSize * 2);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.font = `800 ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.18));
  ctx.strokeStyle = "rgba(10, 10, 11, 0.92)";
  ctx.strokeText(trimmed, canvasW / 2, canvasH / 2, canvasW - 24);
  ctx.fillStyle = "#c8f03c";
  ctx.fillText(trimmed, canvasW / 2, canvasH / 2, canvasW - 24);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

async function transcodeWithFfmpeg(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const { fetchFile } = await import("@ffmpeg/util");
  const ffmpeg = await getFFmpegInstance();

  const uid = `${Date.now()}_${++jobCounter}`;
  const inputExt = file.name.split(".").pop()?.toLowerCase() ?? "tmp";
  const inputName = `input_${uid}.${inputExt}`;
  const outputName = `output_${uid}.${targetFormat}`;
  const captionOverlayName =
    targetFormat.toLowerCase() === "gif" && settings.gifCaption?.trim()
      ? `caption_${uid}.png`
      : undefined;

  onProgress?.(5);

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  let wroteCaption = false;
  if (captionOverlayName && settings.gifCaption) {
    const pngBytes = await renderGifCaptionOverlayPng(
      settings.gifCaption,
      settings.width ?? 480
    );
    if (pngBytes) {
      await ffmpeg.writeFile(captionOverlayName, pngBytes);
      wroteCaption = true;
    }
  }
  onProgress?.(20);

  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.min(95, Math.max(20, Math.round(20 + progress * 75)));
    onProgress?.(pct);
  };
  ffmpeg.on("progress", progressHandler);

  try {
    const args = buildFfmpegArgs(
      inputName,
      outputName,
      targetFormat,
      settings,
      wroteCaption ? captionOverlayName : undefined
    );
    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      throw new Error(`FFmpeg transcode failed with exit code ${exitCode}`);
    }
    onProgress?.(96);

    const outputData = await ffmpeg.readFile(outputName);
    onProgress?.(100);

    const audioFormats = ["mp3", "wav", "ogg", "aac", "m4a", "flac"];
    let mimeType = `video/${targetFormat}`;
    if (audioFormats.includes(targetFormat)) {
      mimeType = `audio/${targetFormat}`;
    } else if (targetFormat === "gif") {
      mimeType = "image/gif";
    } else if (targetFormat === "mov") {
      mimeType = "video/quicktime";
    }

    const buffer =
      typeof outputData === "string"
        ? new TextEncoder().encode(outputData).buffer
        : new Uint8Array(outputData).buffer;
    return new Blob([buffer], { type: mimeType });
  } finally {
    ffmpeg.off("progress", progressHandler);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch { /* ignore cleanup */ }
    if (wroteCaption && captionOverlayName) {
      try {
        await ffmpeg.deleteFile(captionOverlayName);
      } catch { /* ignore cleanup */ }
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch { /* ignore cleanup */ }
  }
}

/**
 * Transcodes media via Mediabunny WebCodecs when supported and seamlessly falls back
 * to self-hosted FFmpeg WASM if unavailable or if hardware encoding rejects.
 */
export async function transcodeMediaWithInfo(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; engine: MediaEngineUsed }> {
  validateTrimRange(settings.trimStart, settings.trimEnd);

  const canHw = await probeWebCodecsSupport(targetFormat, {
    width: settings.width,
    height: settings.height,
    bitrate: resolveTargetBitrate(settings),
  });

  if (canHw) {
    try {
      const blob = await transcodeWithMediabunny(file, targetFormat, settings, onProgress);
      return { blob, engine: "webcodecs" };
    } catch (err) {
      console.warn("WebCodecs/Mediabunny transcode failed, falling back to FFmpeg WASM:", err);
    }
  }

  const blob = await transcodeWithFfmpeg(file, targetFormat, settings, onProgress);
  return { blob, engine: "ffmpeg" };
}

/**
 * Transcodes media file (video or audio), returning the resulting Blob.
 */
export async function transcodeMedia(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const { blob } = await transcodeMediaWithInfo(file, targetFormat, settings, onProgress);
  return blob;
}
