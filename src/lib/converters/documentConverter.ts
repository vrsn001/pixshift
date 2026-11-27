import { preprocessImageFile } from "./imageConverter";

async function rasterizeBlobToPngBuffer(blob: Blob): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not acquire 2D canvas context");
      }
      ctx.drawImage(bitmap, 0, 0);
      const pngBlob = await canvas.convertToBlob({ type: "image/png" });
      return await pngBlob.arrayBuffer();
    }

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not acquire 2D canvas context");
    }
    ctx.drawImage(bitmap, 0, 0);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas failed to export PNG page"));
      }, "image/png");
    });
    return await pngBlob.arrayBuffer();
  } finally {
    bitmap.close();
  }
}

/**
 * Merges one or more image files into a PDF document.
 * Processes images sequentially and immediately closes decoded bitmaps to avoid OOM.
 */
export async function mergeImagesToPdf(
  files: File[],
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.create();
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    if (!file) continue;

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const sourceBlob = await preprocessImageFile(file);

    let image;
    if (ext === "png") {
      const arrayBuffer = await sourceBlob.arrayBuffer();
      image = await pdfDoc.embedPng(arrayBuffer);
    } else if (ext === "jpg" || ext === "jpeg") {
      const arrayBuffer = await sourceBlob.arrayBuffer();
      image = await pdfDoc.embedJpg(arrayBuffer);
    } else {
      const pngBuffer = await rasterizeBlobToPngBuffer(sourceBlob);
      image = await pdfDoc.embedPng(pngBuffer);
    }

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });

    onProgress?.(Math.round(((i + 1) / total) * 90));
  }

  const pdfBytes = await pdfDoc.save();
  onProgress?.(100);
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

/**
 * Extracts all pages of a PDF into individual PNG or JPEG images.
 * Uses the self-hosted PDF.js worker and cleans up every page and PDF handle in finally blocks.
 */
export async function extractPdfToImages(
  file: File,
  targetFormat: "png" | "jpeg" = "png",
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }[]> {
  if (targetFormat !== "png" && targetFormat !== "jpeg") {
    throw new Error(`Unsupported document target format: ${String(targetFormat)}`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");

  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const results: { name: string; blob: Blob }[] = [];

  try {
    const numPages = pdf.numPages;
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const mimeType = targetFormat === "jpeg" ? "image/jpeg" : "image/png";

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      try {
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          throw new Error("Could not acquire 2D canvas context for PDF render");
        }

        if (targetFormat === "jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error(`Failed to render PDF page ${pageNum}`));
            },
            mimeType,
            0.95
          );
        });

        results.push({
          name: `${baseName}_page_${pageNum}.${targetFormat}`,
          blob,
        });
      } finally {
        page.cleanup();
      }

      onProgress?.(Math.round((pageNum / numPages) * 100));
    }

    return results;
  } finally {
    await pdf.destroy();
  }
}
