import { ConversionSettings } from "@/types/converter";

export interface WebCodecsDimensions {
  width?: number | null;
  height?: number | null;
  bitrate?: number;
}

const WEBCODECS_SUPPORTED_TARGETS = new Set(["mp4", "webm", "mov"]);

export function resolveTargetBitrate(settings: ConversionSettings): number {
  if (settings.videoBitrateMbps && settings.videoBitrateMbps > 0) {
    return Math.round(settings.videoBitrateMbps * 1_000_000);
  }
  switch (settings.videoQualityPreset) {
    case "high":
      return 5_000_000;
    case "compact":
      return 1_000_000;
    case "balanced":
    default: {
      if (settings.quality >= 90) return 5_000_000;
      if (settings.quality <= 55) return 1_000_000;
      return 2_500_000;
    }
  }
}

function getCandidateCodecs(targetFormat: string): ("avc" | "vp9" | "vp8")[] {
  const fmt = targetFormat.toLowerCase();
  if (fmt === "mp4" || fmt === "mov") {
    return ["avc"];
  }
  if (fmt === "webm") {
    return ["vp9", "vp8"];
  }
  return [];
}

/**
 * Probes whether native WebCodecs + Mediabunny can encode the requested target container & dimensions.
 */
export async function probeWebCodecsSupport(
  targetFormat: string,
  dims?: WebCodecsDimensions
): Promise<boolean> {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    return false;
  }

  const fmt = targetFormat.toLowerCase();
  if (!WEBCODECS_SUPPORTED_TARGETS.has(fmt)) {
    return false;
  }

  const candidates = getCandidateCodecs(fmt);
  if (candidates.length === 0) {
    return false;
  }

  try {
    const { canEncodeVideo, Quality } = await import("mediabunny");
    const bitrateValue = dims?.bitrate ?? 2_500_000;

    for (const codec of candidates) {
      const ok = await canEncodeVideo(codec, {
        ...(dims?.width ? { width: dims.width } : {}),
        ...(dims?.height ? { height: dims.height } : {}),
        bitrate: new Quality({ bitrate: bitrateValue }),
      });
      if (ok) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Transcodes / trims video using Mediabunny backed by hardware WebCodecs.
 */
export async function transcodeWithMediabunny(
  file: File,
  targetFormat: string,
  settings: ConversionSettings,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const {
    Input,
    BlobSource,
    ALL_FORMATS,
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    MovOutputFormat,
    BufferTarget,
    Conversion,
    Quality,
  } = await import("mediabunny");

  const fmt = targetFormat.toLowerCase();
  const candidates = getCandidateCodecs(fmt);
  const chosenCodec = candidates[0];
  if (!chosenCodec) {
    throw new Error(`Mediabunny does not support target container "${targetFormat}".`);
  }

  const outputFormat =
    fmt === "webm"
      ? new WebMOutputFormat()
      : fmt === "mov"
      ? new MovOutputFormat()
      : new Mp4OutputFormat();

  const mimeType =
    fmt === "webm" ? "video/webm" : fmt === "mov" ? "video/quicktime" : "video/mp4";

  const bitrate = resolveTargetBitrate(settings);
  const qualityObj = new Quality({ bitrate });

  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  try {
    const bufferTarget = new BufferTarget();
    const output = new Output({
      format: outputFormat,
      target: bufferTarget,
    });

    const trim: { start?: number; end?: number } = {};
    if (settings.trimStart !== undefined && settings.trimStart !== null) {
      trim.start = settings.trimStart;
    }
    if (settings.trimEnd !== undefined && settings.trimEnd !== null) {
      trim.end = settings.trimEnd;
    }

    const conversion = await Conversion.init({
      input,
      output,
      showWarnings: false,
      ...(Object.keys(trim).length > 0 ? { trim } : {}),
      video: {
        codec: chosenCodec,
        quality: qualityObj,
        ...(settings.width ? { width: settings.width } : {}),
        ...(settings.height ? { height: settings.height } : {}),
        ...(settings.width && settings.height
          ? { fit: settings.maintainAspectRatio ? ("contain" as const) : ("fill" as const) }
          : {}),
        ...(settings.fps ? { frameRate: settings.fps } : {}),
      },
      audio: {
        quality: new Quality({ bitrate: parseAudioBitrate(settings.audioBitrate) }),
      },
    });

    if (!conversion.isValid) {
      throw new Error("Mediabunny conversion configuration is not valid for this media file.");
    }

    conversion.onProgress = (progress: number) => {
      onProgress?.(Math.min(99, Math.max(5, Math.round(progress * 100))));
    };

    onProgress?.(5);
    await conversion.execute();

    const buffer = bufferTarget.buffer;
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("Mediabunny produced an empty output buffer.");
    }

    onProgress?.(100);
    return new Blob([buffer], { type: mimeType });
  } finally {
    input.dispose();
  }
}

function parseAudioBitrate(bitrate?: ConversionSettings["audioBitrate"]): number {
  switch (bitrate) {
    case "96k":
      return 96_000;
    case "128k":
      return 128_000;
    case "256k":
      return 256_000;
    case "320k":
      return 320_000;
    case "192k":
    default:
      return 192_000;
  }
}
