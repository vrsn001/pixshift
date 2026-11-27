import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { ConversionSettings } from "@/types/converter";

let ffmpegInstance: FFmpeg | null = null;
let isLoaded = false;
let loadingPromise: Promise<FFmpeg> | null = null;
let jobCounter = 0;

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

/**
 * Transcodes media file (video or audio) using self-hosted FFmpeg WebAssembly
 */
export async function transcodeMedia(
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

  onProgress?.(5);

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  onProgress?.(20);

  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.min(95, Math.max(20, Math.round(20 + progress * 75)));
    onProgress?.(pct);
  };
  ffmpeg.on("progress", progressHandler);

  try {
    const args: string[] = ["-i", inputName];

    const audioFormats = ["mp3", "wav", "ogg", "aac", "m4a", "flac"];
    if (audioFormats.includes(targetFormat)) {
      args.push("-vn");
      if (settings.audioBitrate) {
        args.push("-b:a", settings.audioBitrate);
      }
    } else if (targetFormat === "gif") {
      args.push(
        "-vf",
        "fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"
      );
    } else {
      if (settings.width && settings.height) {
        args.push("-vf", `scale=${settings.width}:${settings.height}`);
      } else if (settings.width) {
        args.push("-vf", `scale=${settings.width}:-2`);
      } else if (settings.height) {
        args.push("-vf", `scale=-2:${settings.height}`);
      }

      if (targetFormat === "mp4") {
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
      } else if (targetFormat === "webm") {
        args.push("-c:v", "libvpx-vp9");
      }
    }

    args.push(outputName);

    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      throw new Error(`FFmpeg transcode failed with exit code ${exitCode}`);
    }
    onProgress?.(96);

    const outputData = await ffmpeg.readFile(outputName);
    onProgress?.(100);

    let mimeType = `video/${targetFormat}`;
    if (audioFormats.includes(targetFormat)) {
      mimeType = `audio/${targetFormat}`;
    }
    if (targetFormat === "gif") {
      mimeType = "image/gif";
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
    } catch { /* ignore virtual FS cleanup errors */ }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch { /* ignore virtual FS cleanup errors */ }
  }
}
