import { FileCategory, SupportedFormat } from "@/types/converter";
import { DEFAULT_TARGET_MAP } from "./registry";

const EXTENSION_MAP: Record<string, { category: FileCategory; format: string }> = {
  // Images
  png: { category: "image", format: "png" },
  jpg: { category: "image", format: "jpeg" },
  jpeg: { category: "image", format: "jpeg" },
  webp: { category: "image", format: "webp" },
  avif: { category: "image", format: "avif" },
  bmp: { category: "image", format: "bmp" },
  ico: { category: "image", format: "ico" },
  svg: { category: "image", format: "svg" },
  heic: { category: "image", format: "heic" },
  heif: { category: "image", format: "heif" },
  tiff: { category: "image", format: "tiff" },
  tif: { category: "image", format: "tiff" },

  // Video
  mp4: { category: "video", format: "mp4" },
  webm: { category: "video", format: "webm" },
  mkv: { category: "video", format: "mkv" },
  avi: { category: "video", format: "avi" },
  mov: { category: "video", format: "mov" },
  flv: { category: "video", format: "flv" },
  wmv: { category: "video", format: "wmv" },
  m4v: { category: "video", format: "mp4" },
  gif: { category: "video", format: "gif" },

  // Audio
  mp3: { category: "audio", format: "mp3" },
  wav: { category: "audio", format: "wav" },
  ogg: { category: "audio", format: "ogg" },
  aac: { category: "audio", format: "aac" },
  m4a: { category: "audio", format: "m4a" },
  flac: { category: "audio", format: "flac" },
  wma: { category: "audio", format: "wma" },

  // Document
  pdf: { category: "document", format: "pdf" },
};

export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase().trim() : "";
}

export function detectFileInfo(file: File): { category: FileCategory; inputFormat: string; defaultTarget: SupportedFormat } {
  const ext = getFileExtension(file.name);
  const match = EXTENSION_MAP[ext];

  if (match) {
    return {
      category: match.category,
      inputFormat: match.format,
      defaultTarget: match.format === "webp" ? "png" : DEFAULT_TARGET_MAP[match.category],
    };
  }

  // Fallback to MIME type detection
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) {
    return { category: "image", inputFormat: ext || "image", defaultTarget: "webp" };
  }
  if (mime.startsWith("video/")) {
    return { category: "video", inputFormat: ext || "video", defaultTarget: "mp4" };
  }
  if (mime.startsWith("audio/")) {
    return { category: "audio", inputFormat: ext || "audio", defaultTarget: "mp3" };
  }
  if (mime === "application/pdf") {
    return { category: "document", inputFormat: "pdf", defaultTarget: "png" };
  }

  // Generic fallback
  return { category: "image", inputFormat: ext || "unknown", defaultTarget: "webp" };
}
