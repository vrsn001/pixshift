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
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/**
 * Bundles multiple blobs into a single .zip file.
 * Uses STORE for already-compressed formats to avoid wasting CPU on re-compression.
 */
export async function createZipArchive(
  files: FileToZip[],
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  files.forEach((file) => {
    const ext = getExtension(file.name);
    const isPreCompressed = ALREADY_COMPRESSED.has(ext);

    if (file.folder) {
      zip.folder(file.folder)?.file(file.name, file.blob, isPreCompressed ? { compression: "STORE" } : undefined);
    } else {
      zip.file(file.name, file.blob, isPreCompressed ? { compression: "STORE" } : undefined);
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
 * Triggers a browser download for a given Blob and filename
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
