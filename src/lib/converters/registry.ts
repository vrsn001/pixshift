import { FileCategory, FormatOption, SupportedFormat } from "@/types/converter";

export const FORMAT_REGISTRY: Record<SupportedFormat, FormatOption> = {
  webp: { format: "webp", label: "WebP", description: "Modern web image format with great compression", category: "image" },
  png: { format: "png", label: "PNG", description: "Lossless image with transparency support", category: "image" },
  jpeg: { format: "jpeg", label: "JPEG", description: "Standard photo format with adjustable lossy quality", category: "image" },
  jpg: { format: "jpg", label: "JPG", description: "Standard photo format with adjustable lossy quality", category: "image" },
  avif: { format: "avif", label: "AVIF", description: "Next-gen ultra-high compression image format", category: "image" },
  bmp: { format: "bmp", label: "BMP", description: "Uncompressed bitmap raster format", category: "image" },
  ico: { format: "ico", label: "ICO", description: "Icon format for websites and apps", category: "image" },
  svg: { format: "svg", label: "SVG", description: "Vector graphic format", category: "image" },

  mp4: { format: "mp4", label: "MP4", description: "Universally compatible H.264 video format", category: "video" },
  webm: { format: "webm", label: "WebM", description: "Open web video format (VP9 / Opus)", category: "video" },
  mkv: { format: "mkv", label: "MKV", description: "Matroska flexible container format", category: "video" },
  avi: { format: "avi", label: "AVI", description: "Audio Video Interleave container", category: "video" },
  mov: { format: "mov", label: "MOV", description: "Apple QuickTime video format", category: "video" },
  gif: { format: "gif", label: "GIF", description: "Animated looping GIF", category: "video" },

  mp3: { format: "mp3", label: "MP3", description: "Universal MPEG audio format", category: "audio" },
  wav: { format: "wav", label: "WAV", description: "Uncompressed lossless PCM audio", category: "audio" },
  ogg: { format: "ogg", label: "OGG", description: "Vorbis open-source audio container", category: "audio" },
  aac: { format: "aac", label: "AAC", description: "Advanced Audio Coding standard", category: "audio" },
  m4a: { format: "m4a", label: "M4A", description: "High-quality Apple audio format", category: "audio" },
  flac: { format: "flac", label: "FLAC", description: "Free Lossless Audio Codec", category: "audio" },

  pdf: { format: "pdf", label: "PDF", description: "Portable Document Format", category: "document" },
  txt: { format: "txt", label: "TXT (OCR)", description: "Extract text via offline OCR engine", category: "image" },
};

export const AVAILABLE_TARGETS: Record<FileCategory, SupportedFormat[]> = {
  image: ["webp", "png", "jpeg", "avif", "bmp", "ico", "pdf", "txt"],
  video: ["mp4", "webm", "gif", "mp3", "wav", "mkv", "avi", "mov"],
  audio: ["mp3", "wav", "ogg", "aac", "m4a", "flac"],
  // Removed "pdf" from document targets — PDF extraction outputs PNG or JPEG pages
  document: ["png", "jpeg"],
};

export const DEFAULT_TARGET_MAP: Record<FileCategory, SupportedFormat> = {
  image: "webp",
  video: "mp4",
  audio: "mp3",
  document: "png",
};
