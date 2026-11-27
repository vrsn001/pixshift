export interface PdfPageOperation {
  sourcePageIndex: number; // 0-based page index
  rotateDeg?: 0 | 90 | 180 | 270;
}

export interface PdfPageThumbnail {
  pageNumber: number; // 1-based
  sourcePageIndex: number;
  width: number;
  height: number;
  initialRotateDeg: number;
  thumbnailUrl: string;
}

/**
 * Parses comma-separated 1-based page range expressions (e.g. `"1-3, 5"`) into
 * grouped arrays of 0-based page indices validated against `totalPages`.
 */
export function parsePageRanges(expr: string, totalPages: number): number[][] {
  if (!Number.isFinite(totalPages) || totalPages < 1) {
    throw new Error("PDF has no pages.");
  }

  const trimmed = expr.trim();
  if (!trimmed) {
    throw new Error("Enter at least one page number or range (e.g. 1-2, 4).");
  }

  const parts = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length === 0) {
    throw new Error("Enter at least one page number or range.");
  }

  const groups: number[][] = [];

  for (const part of parts) {
    const dashMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (dashMatch) {
      const start = Number.parseInt(dashMatch[1] ?? "0", 10);
      const end = Number.parseInt(dashMatch[2] ?? "0", 10);
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        throw new Error(`Page range "${part}" is out of range (1–${totalPages}).`);
      }
      if (end < start) {
        throw new Error(`Invalid reversed page range "${part}".`);
      }
      const group: number[] = [];
      for (let p = start; p <= end; p++) {
        group.push(p - 1);
      }
      groups.push(group);
      continue;
    }

    if (/^\d+$/.test(part)) {
      const pageNum = Number.parseInt(part, 10);
      if (pageNum < 1 || pageNum > totalPages) {
        throw new Error(`Page "${pageNum}" is out of range (1–${totalPages}).`);
      }
      groups.push([pageNum - 1]);
      continue;
    }

    throw new Error(`Invalid page range syntax "${part}". Expected formats like "1-3, 5".`);
  }

  return groups;
}

/**
 * Renders low-memory visual thumbnails sequentially using self-hosted `/pdfjs/pdf.worker.min.mjs`.
 * Caller is responsible for revoking returned `thumbnailUrl` ObjectURLs on unmount/close.
 */
export async function renderPdfThumbnailsSequential(
  file: File,
  onProgress?: (pct: number) => void
): Promise<PdfPageThumbnail[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const thumbs: PdfPageThumbnail[] = [];

  try {
    const total = pdf.numPages;
    for (let pageNum = 1; pageNum <= total; pageNum++) {
      const page = await pdf.getPage(pageNum);
      try {
        const baseViewport = page.getViewport({ scale: 1.0 });
        const scale = Math.min(0.6, 220 / Math.max(1, baseViewport.width));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Could not acquire 2D context for PDF thumbnail");
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error(`Thumbnail failed for page ${pageNum}`))),
            "image/png"
          );
        });

        thumbs.push({
          pageNumber: pageNum,
          sourcePageIndex: pageNum - 1,
          width: Math.round(baseViewport.width),
          height: Math.round(baseViewport.height),
          initialRotateDeg: page.rotate ?? 0,
          thumbnailUrl: URL.createObjectURL(blob),
        });
      } finally {
        page.cleanup();
      }
      onProgress?.(Math.round((pageNum / total) * 100));
    }

    return thumbs;
  } finally {
    await pdf.destroy();
  }
}

/**
 * Produces a new PDF containing only the ordered/rotated pages specified in `ops`.
 */
export async function editPdfPages(
  file: File,
  ops: readonly PdfPageOperation[]
): Promise<Blob> {
  if (ops.length === 0) {
    throw new Error("Select at least one page to export.");
  }

  const { PDFDocument, degrees } = await import("pdf-lib");
  const srcBytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(srcBytes);
  const totalPages = srcDoc.getPageCount();

  for (const op of ops) {
    if (op.sourcePageIndex < 0 || op.sourcePageIndex >= totalPages) {
      throw new Error(`Page index ${op.sourcePageIndex + 1} is out of bounds.`);
    }
  }

  const outDoc = await PDFDocument.create();
  const copiedPages = await outDoc.copyPages(
    srcDoc,
    ops.map((o) => o.sourcePageIndex)
  );

  copiedPages.forEach((copied, i) => {
    const extraRotate = ops[i]?.rotateDeg ?? 0;
    if (extraRotate !== 0) {
      const currentAngle = copied.getRotation().angle;
      copied.setRotation(degrees((currentAngle + extraRotate) % 360));
    }
    outDoc.addPage(copied);
  });

  const outBytes = await outDoc.save();
  return new Blob([outBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

/**
 * Splits a PDF into multiple PDF blobs matching a 1-based range expression (`"1-2, 3-4"`).
 */
export async function splitPdfByRanges(
  file: File,
  rangesExpr: string
): Promise<{ name: string; blob: Blob }[]> {
  const { PDFDocument } = await import("pdf-lib");
  const srcBytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(srcBytes);
  const totalPages = srcDoc.getPageCount();
  const groups = parsePageRanges(rangesExpr, totalPages);
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const outputs: { name: string; blob: Blob }[] = [];

  for (let i = 0; i < groups.length; i++) {
    const indices = groups[i];
    if (!indices || indices.length === 0) continue;
    const partDoc = await PDFDocument.create();
    const copied = await partDoc.copyPages(srcDoc, indices);
    copied.forEach((page) => partDoc.addPage(page));
    const bytes = await partDoc.save();
    outputs.push({
      name: `${baseName}_part_${i + 1}.pdf`,
      blob: new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }),
    });
  }

  return outputs;
}

/**
 * Merges multiple PDF files cleanly in input order into a single PDF document.
 */
export async function mergePdfDocuments(files: readonly File[]): Promise<Blob> {
  if (files.length === 0) {
    throw new Error("Select at least one PDF to merge.");
  }

  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();

  for (const file of files) {
    const srcDoc = await PDFDocument.load(await file.arrayBuffer());
    const indices = srcDoc.getPageIndices();
    const copied = await merged.copyPages(srcDoc, indices);
    copied.forEach((page) => merged.addPage(page));
  }

  const bytes = await merged.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}
