import { ConversionSettings } from "@/types/converter";

let ffmpegInstance: any = null;
let isLoaded = false;
let loadingPromise: Promise<any> | null = null;

/**
 * Lazily loads and initializes FFmpeg WebAssembly instance.
 * Deduplicates concurrent load requests so multiple callers share one download.
 */
export async function getFFmpegInstance(onLog?: (msg: string) => void) {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance;
  }

  // Deduplicate: if already loading, wait for the same promise
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

    // Load WASM binaries from unpkg
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      isLoaded = true;
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (err) {
      loadingPromise = null; // Allow retry on failure
      console.warn("Failed to load FFmpeg:", err);
      throw new Error("Could not initialize FFmpeg WebAssembly. Ensure your browser supports WebAssembly.");
    }
  })();

  return loadingPromise;
}

/**
 * Preloads FFmpeg WASM in the background.
 * Call when the user first drops a video/audio file to front-load the ~25 MB download.
 */
export function preloadFFmpeg(): void {
  getFFmpegInstance().catch(() => {
    // Silently fail on preload — will retry on actual conversion
  });
}

/**
 * Transcodes media file (video or audio) using FFmpeg WebAssembly
 */
export async function transcodeMedia(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const { fetchFile } = await import("@ffmpeg/util");
  const ffmpeg = await getFFmpegInstance();

  const inputExt = file.name.split(".").pop()?.toLowerCase() || "tmp";
  const inputName = `input_${Date.now()}.${inputExt}`;
  const outputName = `output_${Date.now()}.${targetFormat}`;

  onProgress?.(5);

  // Write input file to virtual memory FS
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  onProgress?.(20);

  // Set up progress tracking
  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.min(95, Math.max(20, Math.round(20 + progress * 75)));
    onProgress?.(pct);
  };
  ffmpeg.on("progress", progressHandler);

  try {
    const args: string[] = ["-i", inputName];

    // Video to Audio extraction
    const audioFormats = ["mp3", "wav", "ogg", "aac", "m4a", "flac"];
    if (audioFormats.includes(targetFormat)) {
      args.push("-vn"); // Strip video stream
      if (settings.audioBitrate) {
        args.push("-b:a", settings.audioBitrate);
      }
    } else if (targetFormat === "gif") {
      // High quality GIF with palettegen
      args.push(
        "-vf",
        "fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"
      );
    } else {
      // Video transcoding
      if (settings.width && settings.height) {
        args.push("-vf", `scale=${settings.width}:${settings.height}`);
      } else if (settings.width) {
        args.push("-vf", `scale=${settings.width}:-2`);
      }

      if (targetFormat === "mp4") {
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
      } else if (targetFormat === "webm") {
        args.push("-c:v", "libvpx-vp9");
      }
    }

    args.push(outputName);

    // Execute transcode command
    await ffmpeg.exec(args);
    onProgress?.(96);

    // Read result from virtual FS
    const outputData = await ffmpeg.readFile(outputName);
    onProgress?.(100);

    // Map MIME type
    let mimeType = `video/${targetFormat}`;
    if (audioFormats.includes(targetFormat)) {
      mimeType = `audio/${targetFormat}`;
    }
    if (targetFormat === "gif") {
      mimeType = "image/gif";
    }

    const buffer = typeof outputData === "string" ? new TextEncoder().encode(outputData).buffer : (outputData as Uint8Array).buffer as ArrayBuffer;
    return new Blob([buffer], { type: mimeType });
  } finally {
    ffmpeg.off("progress", progressHandler);
    // Cleanup virtual memory files
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch { }
  }
}
