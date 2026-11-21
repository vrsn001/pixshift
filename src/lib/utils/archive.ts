import JSZip from "jszip";

export interface FileToZip {
  name: string;
  blob: Blob;
  folder?: string;
}

/**
 * Bundles multiple blobs into a single compressed .zip file
 */
export async function createZipArchive(
  files: FileToZip[],
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const zip = new JSZip();

  files.forEach((file) => {
    if (file.folder) {
      zip.folder(file.folder)?.file(file.name, file.blob);
    } else {
      zip.file(file.name, file.blob);
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
