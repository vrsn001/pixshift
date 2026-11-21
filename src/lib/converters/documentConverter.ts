/**
 * Merges an array of image files into a single multi-page PDF document.
 * Pre-decodes all images in parallel for faster processing.
 */
export async function mergeImagesToPdf(
  files: File[],
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.create();
  const total = files.length;

  // Pre-decode all images in parallel using createImageBitmap
  const bitmaps = await Promise.all(files.map((f) => createImageBitmap(f)));
  onProgress?.(30);

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const bitmap = bitmaps[i];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    let image;
    if (ext === "png") {
      const arrayBuffer = await file.arrayBuffer();
      image = await pdfDoc.embedPng(arrayBuffer);
    } else if (ext === "jpg" || ext === "jpeg") {
      const arrayBuffer = await file.arrayBuffer();
      image = await pdfDoc.embedJpg(arrayBuffer);
    } else {
      // For WebP, AVIF, BMP, etc. — render bitmap to canvas and export as PNG
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(bitmap, 0, 0);
      const pngBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      const pngBuffer = await pngBlob.arrayBuffer();
      image = await pdfDoc.embedPng(pngBuffer);
    }

    bitmap.close(); // Free memory

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });

    onProgress?.(Math.round(30 + ((i + 1) / total) * 60));
  }

  const pdfBytes = await pdfDoc.save();
  onProgress?.(100);
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

/**
 * Extracts all pages of a PDF into individual PNG or JPEG images.
 * Processes pages in parallel batches of 4 for faster extraction.
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
  const results: ({ name: string; blob: Blob } | null)[] = new Array(numPages).fill(null);

  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const mimeType = targetFormat === "jpeg" ? "image/jpeg" : "image/png";

  // Process pages in parallel batches of 4
  const BATCH_SIZE = 4;
  let completed = 0;

  for (let batchStart = 0; batchStart < numPages; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, numPages);
    const pageNumbers = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i + 1);

    await Promise.all(
      pageNumbers.map(async (pageNum) => {
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

          const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), mimeType, 0.95);
          });

          results[pageNum - 1] = {
            name: `${baseName}_page_${pageNum}.${targetFormat}`,
            blob,
          };
        }

        completed++;
        onProgress?.(Math.round((completed / numPages) * 100));
      })
    );
  }

  return results.filter((r): r is { name: string; blob: Blob } => r !== null);
}
