import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ocrEngine (self-hosted tesseract.js)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("tesseract.js");
    vi.doUnmock("@/lib/converters/documentConverter");
  });

  it("uses self-hosted /tesseract worker, core, and lang paths and terminates worker cleanly", async () => {
    const terminate = vi.fn().mockResolvedValue(undefined);
    const recognize = vi.fn().mockResolvedValue({
      data: { text: "Hello Pixshift OCR", confidence: 94.5 },
    });
    const createWorker = vi.fn().mockResolvedValue({ recognize, terminate });

    vi.doMock("tesseract.js", () => ({
      createWorker,
    }));

    const { extractTextWithOcr } = await import("@/lib/engines/ocrEngine");
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "scan.png", {
      type: "image/png",
    });

    const result = await extractTextWithOcr(file, "image", { language: "eng" });
    expect(result.text).toBe("Hello Pixshift OCR");
    expect(result.pages).toBe(1);
    expect(result.confidence).toBeCloseTo(94.5);

    expect(createWorker).toHaveBeenCalledTimes(1);
    const [lang, oem, opts] = createWorker.mock.calls[0] as [
      string,
      number,
      Record<string, unknown>,
    ];
    expect(lang).toBe("eng");
    expect(oem).toBe(1);
    expect(String(opts.workerPath)).toContain("/tesseract/worker.min.js");
    expect(String(opts.corePath)).toContain("/tesseract");
    expect(String(opts.langPath)).toContain("/tesseract");
    expect(opts.gzip).toBe(true);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("extracts and joins multi-page PDF OCR output cleanly", async () => {
    const terminate = vi.fn().mockResolvedValue(undefined);
    let callIdx = 0;
    const recognize = vi.fn().mockImplementation(async () => {
      callIdx++;
      return {
        data: { text: `Page ${callIdx} body`, confidence: 90 },
      };
    });
    const createWorker = vi.fn().mockResolvedValue({ recognize, terminate });

    vi.doMock("tesseract.js", () => ({ createWorker }));
    vi.doMock("@/lib/converters/documentConverter", () => ({
      extractPdfToImages: vi.fn().mockResolvedValue([
        { name: "p1.png", blob: new Blob([new Uint8Array([1])], { type: "image/png" }) },
        { name: "p2.png", blob: new Blob([new Uint8Array([2])], { type: "image/png" }) },
      ]),
    }));

    const { extractTextWithOcr } = await import("@/lib/engines/ocrEngine");
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "doc.pdf", {
      type: "application/pdf",
    });

    const res = await extractTextWithOcr(pdf, "document");
    expect(res.pages).toBe(2);
    expect(res.text).toContain("=== Page 1 ===");
    expect(res.text).toContain("Page 1 body");
    expect(res.text).toContain("=== Page 2 ===");
    expect(res.text).toContain("Page 2 body");
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
