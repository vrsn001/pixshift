export type FileCategory = "image" | "video" | "audio" | "document";

export type ImageFormat = "webp" | "png" | "jpeg" | "jpg" | "avif" | "bmp" | "ico" | "svg" | "pdf";
export type VideoFormat = "mp4" | "webm" | "mkv" | "avi" | "mov" | "gif" | "mp3" | "wav";
export type AudioFormat = "mp3" | "wav" | "ogg" | "aac" | "m4a" | "flac";
export type DocumentFormat = "png" | "jpeg";

export type SupportedFormat = ImageFormat | VideoFormat | AudioFormat | DocumentFormat;

export type VideoQualityPreset = "high" | "balanced" | "compact";

export interface DroppedFileEntry {
  file: File;
  relativePath: string;
  folderPath: string;
}

export interface ExifTagEntry {
  tag: string;
  label: string;
  value: string;
  group: "camera" | "exposure" | "date" | "gps" | "other";
}

export interface ExifInfo {
  hasExif: boolean;
  hasXmp: boolean;
  markers: string[];
  orientation?: number;
  tags?: ExifTagEntry[];
  hasGps?: boolean;
}

export interface ImageCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "px" | "percent";
}

export type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "tile";

export interface WatermarkSettings {
  enabled: boolean;
  mode: "text" | "image";
  text?: string;
  imageDataUrl?: string;
  position: WatermarkPosition;
  opacity: number;
  scale: number;
  color?: string;
}

export interface RenameSettings {
  enabled: boolean;
  pattern: string;
  prefix?: string;
  suffix?: string;
  startIndex?: number;
  zeroPad?: number;
}

export type ZipStructureMode = "preserve" | "flatten";

export interface BatchTelemetrySnapshot {
  totalCount: number;
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  errorCount: number;
  overallProgressPct: number;
  totalInputBytes: number;
  completedInputBytes: number;
  completedOutputBytes: number;
  savedBytes: number;
  savedPercent: number;
  filesPerSec: number;
  mbPerSec: number;
  elapsedMs: number;
  zipProgressPct?: number | null;
}

export interface ConversionSettings {
  quality: number; // 1-100
  width?: number | null; // null means keep original
  height?: number | null;
  maintainAspectRatio: boolean;
  audioBitrate?: "96k" | "128k" | "192k" | "256k" | "320k";
  fps?: number;
  trimStart?: number | null;
  trimEnd?: number | null;
  videoQualityPreset?: VideoQualityPreset;
  videoBitrateMbps?: number | null;
  stripExif?: boolean;
  targetSizeKb?: number | null;
  crop?: ImageCropRect | null;
  rotateDeg?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  watermark?: WatermarkSettings | null;
  rename?: RenameSettings | null;
  gifLoop?: number;
}

export type JobStatus = "pending" | "processing" | "done" | "error";

export interface OutputFile {
  name: string;
  blob: Blob;
  url: string;
  size: number;
}

export interface ConversionJob {
  id: string;
  file: File;
  name: string;
  size: number;
  category: FileCategory;
  inputFormat: string;
  targetFormat: SupportedFormat;
  status: JobStatus;
  progress: number; // 0 - 100
  error?: string;
  settings: ConversionSettings;
  outputFiles?: OutputFile[];
  durationMs?: number;
  sourceDimensions?: { width: number; height: number } | null;
  durationSec?: number | null;
  exifInfo?: ExifInfo | null;
  engineUsed?: "webcodecs" | "ffmpeg" | "canvas" | "pdf" | "binary";
  relativePath?: string;
  folderPath?: string;
  targetUnreachableWarning?: string;
}

export interface FormatOption {
  format: SupportedFormat;
  label: string;
  description: string;
  category: FileCategory;
}
