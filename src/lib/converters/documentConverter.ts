import { PDFDocument } from "pdf-lib";

/**
 * Merges an array of image files into a single multi-page PDF document
 */
export async function mergeImagesToPdf(
  files: File[],
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const arrayBuffer = await file.arrayBuffer();
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    let image;
    if (ext === "png") {
      image = await pdfDoc.embedPng(arrayBuffer);
    } else if (ext === "jpg" || ext === "jpeg") {
      image = await pdfDoc.embedJpg(arrayBuffer);
    } else {
      // For WebP, AVIF, BMP, convert to PNG first via canvas
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(bmp, 0, 0);
      const pngBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      const pngBuffer = await pngBlob.arrayBuffer();
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
 * Extracts all pages of a PDF into individual PNG or JPEG images
 */
export async function extractPdfToImages(
  file: File,
  targetFormat: "png" | "jpeg" = "png",
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }[]> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Dynamically import pdfjs-dist
  const pdfjsLib = await import("pdfjs-dist");
  
  // Configure PDF.js worker
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const results: { name: string; blob: Blob }[] = [];

  const baseName = file.name.replace(/\.[^/.]+$/, "");

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      if (targetFormat === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;

      const mimeType = targetFormat === "jpeg" ? "image/jpeg" : "image/png";
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), mimeType, 0.95);
      });

      results.push({
        name: `${baseName}_page_${pageNum}.${targetFormat}`,
        blob,
      });
    }

    onProgress?.(Math.round((pageNum / numPages) * 100));
  }

  return results;
}
