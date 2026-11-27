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
 * Ensures unique filenames within a zip archive directory, producing
 * `photo (1).webp`, `photo (2).webp`, etc. upon collisions.
 */
export function deduplicateArchivePath(
  name: string,
  folder: string | undefined,
  usedPaths: Set<string>
): string {
  const normalizedFolder = folder?.replace(/^\/+|\/+$/g, "") ?? "";
  const buildKey = (candidate: string) =>
    normalizedFolder ? `${normalizedFolder}/${candidate}` : candidate;

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
    const uniqueName = deduplicateArchivePath(file.name, file.folder, usedPaths);

    if (file.folder) {
      zip.folder(file.folder)?.file(uniqueName, file.blob, isPreCompressed ? { compression: "STORE" } : undefined);
    } else {
      zip.file(uniqueName, file.blob, isPreCompressed ? { compression: "STORE" } : undefined);
    }
  });

  return await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress?.(Math.round(metadata.percent));
    }
  );
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
