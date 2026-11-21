export type FileCategory = "image" | "video" | "audio" | "document";

export type ImageFormat = "webp" | "png" | "jpeg" | "jpg" | "avif" | "bmp" | "ico" | "svg" | "pdf";
export type VideoFormat = "mp4" | "webm" | "mkv" | "avi" | "mov" | "gif" | "mp3" | "wav";
export type AudioFormat = "mp3" | "wav" | "ogg" | "aac" | "m4a" | "flac";
export type DocumentFormat = "pdf" | "png" | "jpeg";

export type SupportedFormat = ImageFormat | VideoFormat | AudioFormat | DocumentFormat;

export interface ConversionSettings {
  quality: number; // 1-100
  width?: number | null; // null means keep original
  height?: number | null;
  maintainAspectRatio: boolean;
  audioBitrate?: "96k" | "128k" | "192k" | "256k" | "320k";
  fps?: number;
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
}

export interface FormatOption {
  format: SupportedFormat;
  label: string;
  description: string;
  category: FileCategory;
}
