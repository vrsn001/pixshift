import type { ConversionJob, ZipStructureMode } from "@/types/converter";

export type { ZipStructureMode } from "@/types/converter";

export interface FileToZip {
  name: string;
  blob: Blob;
  folder?: string;
}

// File extensions that are already compressed — STORE saves CPU with no size gain
const ALREADY_COMPRESSED = new Set([
  "mp4", "webm", "mkv", "avi", "mov", "mp3", "aac", "ogg", "m4a",
  "flac", "wav", "gif", "jpg", "jpeg", "webp", "avif", "heic", "heif",
  "zip", "gz", "br", "zst",
]);

function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : "";
}

/**
 * Normalizes an archive subfolder path (`\` -> `/`, no leading/trailing slashes,
 * strips `.` and `..` traversal segments). Returns `""` for archive root.
 */
export function normalizeArchiveFolder(folder?: string): string {
  if (!folder) return "";
  return folder
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    .join("/");
}

/**
 * Ensures unique filenames within a zip archive directory using case-insensitive
 * collision detection while preserving original filename casing, producing
 * `photo (1).webp`, `photo (2).webp`, etc. upon collisions.
 */
export function deduplicateArchivePath(
  name: string,
  folder: string | undefined,
  usedPaths: Set<string>
): string {
  const normalizedFolder = normalizeArchiveFolder(folder);
  const buildKey = (candidate: string) =>
    normalizedFolder
      ? `${normalizedFolder.toLowerCase()}/${candidate.toLowerCase()}`
      : candidate.toLowerCase();

  if (!usedPaths.has(buildKey(name))) {
    usedPaths.add(buildKey(name));
    return name;
  }

  const lastDot = name.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < name.length - 1;
  const base = hasExt ? name.slice(0, lastDot) : name;
  const extWithDot = hasExt ? name.slice(lastDot) : "";

  let counter = 1;
  while (usedPaths.has(buildKey(`${base} (${counter})${extWithDot}`))) {
    counter++;
  }

  const uniqueName = `${base} (${counter})${extWithDot}`;
  usedPaths.add(buildKey(uniqueName));
  return uniqueName;
}

/**
 * Converts completed conversion jobs into `FileToZip` entries respecting
 * `"preserve"` (keep normalized `job.folderPath`) or `"flatten"` (archive root).
 */
export function buildZipEntriesFromJobs(
  jobs: readonly ConversionJob[],
  mode: ZipStructureMode = "preserve"
): FileToZip[] {
  const entries: FileToZip[] = [];
  for (const job of jobs) {
    if (job.status !== "done" || !job.outputFiles || job.outputFiles.length === 0) {
      continue;
    }
    const normalizedFolder =
      mode === "preserve" ? normalizeArchiveFolder(job.folderPath) : "";
    for (const out of job.outputFiles) {
      entries.push({
        name: out.name,
        blob: out.blob,
        ...(normalizedFolder ? { folder: normalizedFolder } : {}),
      });
    }
  }
  return entries;
}

/**
 * Bundles multiple blobs into a single .zip file with filename deduplication.
 * Uses STORE for already-compressed formats to avoid wasting CPU on re-compression.
 */
export async function createZipArchive(
  files: FileToZip[],
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const usedPaths = new Set<string>();

  files.forEach((file) => {
    const ext = getExtension(file.name);
    const isPreCompressed = ALREADY_COMPRESSED.has(ext);
    const normalizedFolder = normalizeArchiveFolder(file.folder);
    const uniqueName = deduplicateArchivePath(file.name, normalizedFolder, usedPaths);

    if (normalizedFolder) {
      zip
        .folder(normalizedFolder)
        ?.file(uniqueName, file.blob, isPreCompressed ? { compression: "STORE" } : undefined);
    } else {
      zip.file(uniqueName, file.blob, isPreCompressed ? { compression: "STORE" } : undefined);
    }
  });

  const blob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress?.(Math.round(metadata.percent));
    }
  );
  onProgress?.(100);
  return blob;
}

/**
 * Triggers a browser download for an existing ObjectURL without allocating a duplicate Blob URL.
 */
export function triggerDownloadUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Triggers a browser download for a given Blob and filename
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  triggerDownloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
