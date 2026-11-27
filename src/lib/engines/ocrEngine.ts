import type { FileCategory } from "@/types/converter";
import { extractPdfToImages } from "@/lib/converters/documentConverter";
import { preprocessImageFile } from "@/lib/converters/imageConverter";

export interface OcrOptions {
  language?: string;
}

export interface OcrResult {
  text: string;
  confidence?: number;
  pages: number;
}

/**
 * Extracts text from an image or PDF using self-hosted tesseract.js WASM and
 * traineddata assets under `/public/tesseract/`, complying with COEP: require-corp.
 */
export async function extractTextWithOcr(
  file: File,
  category: FileCategory,
  options?: OcrOptions,
  onProgress?: (pct: number) => void
): Promise<OcrResult> {
  const language = options?.language?.trim() || "eng";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const basePath = `${origin}/tesseract`;

  onProgress?.(5);
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker(language, 1, {
    workerPath: `${basePath}/worker.min.js`,
    corePath: basePath,
    langPath: basePath,
    gzip: true,
    workerBlobURL: false,
  });

  try {
    if (category === "document") {
      onProgress?.(10);
      const renderedPages = await extractPdfToImages(file, "png", (pdfPct) => {
        onProgress?.(Math.min(40, Math.round(10 + pdfPct * 0.3)));
      });

      const chunks: string[] = [];
      let confSum = 0;

      for (let i = 0; i < renderedPages.length; i++) {
        const page = renderedPages[i];
        if (!page) continue;
        const res = await worker.recognize(page.blob);
        chunks.push(`=== Page ${i + 1} ===\n${res.data.text.trim()}`);
        confSum += res.data.confidence;
        onProgress?.(Math.min(98, Math.round(40 + ((i + 1) / renderedPages.length) * 58)));
      }

      onProgress?.(100);
      return {
        text: chunks.join("\n\n").trim(),
        confidence: renderedPages.length > 0 ? confSum / renderedPages.length : undefined,
        pages: renderedPages.length,
      };
    }

    onProgress?.(20);
    const sourceBlob = await preprocessImageFile(file);
    onProgress?.(40);
    const res = await worker.recognize(sourceBlob);
    onProgress?.(100);

    return {
      text: res.data.text.trim(),
      confidence: res.data.confidence,
      pages: 1,
    };
  } finally {
    await worker.terminate();
  }
}
