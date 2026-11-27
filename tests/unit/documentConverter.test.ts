import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureFixtures } from "../fixtures/generateFixtures";

describe("documentConverter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("pdfjs-dist");
  });

  it("test_mergeImagesToPdf_single_png_outputs_valid_pdf_magic_bytes", async () => {
    const fixtures = await ensureFixtures();
    const pngBytes = fs.readFileSync(fixtures.samplePng);
    const file = new File([pngBytes], "sample.png", { type: "image/png" });

    const { mergeImagesToPdf } = await import("@/lib/converters/documentConverter");
    const pdfBlob = await mergeImagesToPdf([file]);
    expect(pdfBlob.type).toBe("application/pdf");

    const buf = Buffer.from(await pdfBlob.arrayBuffer());
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("test_mergeImagesToPdf_decodes_sequentially_and_closes_bitmaps", async () => {
    const fixtures = await ensureFixtures();
    const pngBytes = fs.readFileSync(fixtures.samplePng);
    const f1 = new File([pngBytes], "one.webp", { type: "image/webp" });
    const f2 = new File([pngBytes], "two.webp", { type: "image/webp" });

    const events: string[] = [];
    const closeSpies: ReturnType<typeof vi.fn>[] = [];

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(async (blob: Blob) => {
        const name = blob instanceof File ? blob.name : "blob";
        events.push(`decode:${name}`);
        const close = vi.fn(() => {
          events.push(`close:${name}`);
        });
        closeSpies.push(close);
        return { width: 16, height: 16, close };
      })
    );

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return { drawImage: vi.fn() };
      }
      convertToBlob = vi.fn().mockResolvedValue(new Blob([pngBytes], { type: "image/png" }));
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const { mergeImagesToPdf } = await import("@/lib/converters/documentConverter");
    const pdfBlob = await mergeImagesToPdf([f1, f2]);
    expect(pdfBlob.type).toBe("application/pdf");

    // Sequential: first image decoded & closed before second is decoded
    expect(events).toEqual([
      "decode:one.webp",
      "close:one.webp",
      "decode:two.webp",
      "close:two.webp",
    ]);
    expect(closeSpies).toHaveLength(2);
    expect(closeSpies[0]).toHaveBeenCalledTimes(1);
    expect(closeSpies[1]).toHaveBeenCalledTimes(1);
  });

  it("test_extractPdfToImages_cleans_up_pages_destroys_pdf_and_uses_local_worker", async () => {
    const pageCleanup = vi.fn();
    const pdfDestroy = vi.fn().mockResolvedValue(undefined);
    const workerOpts = { workerSrc: "" };

    vi.doMock("pdfjs-dist", () => ({
      version: "4.9.155",
      GlobalWorkerOptions: workerOpts,
      getDocument: vi.fn().mockReturnValue({
        promise: Promise.resolve({
          numPages: 2,
          getPage: vi.fn().mockImplementation(async () => ({
            getViewport: () => ({ width: 20, height: 20 }),
            render: () => ({ promise: Promise.resolve() }),
            cleanup: pageCleanup,
          })),
          destroy: pdfDestroy,
        }),
      }),
    }));

    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          fillRect: vi.fn(),
        }),
        toBlob: (cb: (b: Blob | null) => void) =>
          cb(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })),
      }),
    });

    const fixtures = await ensureFixtures();
    const pdfBytes = fs.readFileSync(fixtures.sample2PagePdf);
    const pdfFile = new File([pdfBytes], path.basename(fixtures.sample2PagePdf), {
      type: "application/pdf",
    });

    const { extractPdfToImages } = await import("@/lib/converters/documentConverter");

    // Rejects invalid document target "pdf"
    await expect(
      extractPdfToImages(pdfFile, "pdf" as unknown as "png")
    ).rejects.toThrow(/Unsupported document target format/i);

    const pages = await extractPdfToImages(pdfFile, "png");
    expect(workerOpts.workerSrc).toBe("/pdfjs/pdf.worker.min.mjs");
    expect(pages).toHaveLength(2);
    expect(pages[0]?.name).toBe("sample-2page_page_1.png");
    expect(pages[1]?.name).toBe("sample-2page_page_2.png");
    expect(pageCleanup).toHaveBeenCalledTimes(2);
    expect(pdfDestroy).toHaveBeenCalledTimes(1);
  });

  it("test_pdfTools_parse_reorder_rotate_split_and_merge", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const {
      parsePageRanges,
      editPdfPages,
      splitPdfByRanges,
      mergePdfDocuments,
    } = await import("@/lib/converters/pdfTools");

    expect(parsePageRanges("1-2, 4", 4)).toEqual([[0, 1], [3]]);
    expect(() => parsePageRanges("4-2", 4)).toThrow(/invalid/i);
    expect(() => parsePageRanges("1, 99", 4)).toThrow(/out of range/i);

    const fixtures = await ensureFixtures();
    const pdf4Bytes = fs.readFileSync(fixtures.sample4PagePdf);
    const pdf4File = new File([pdf4Bytes], "four.pdf", { type: "application/pdf" });

    // Reorder [4th, 1st] with 90deg and 180deg rotation
    const editedBlob = await editPdfPages(pdf4File, [
      { sourcePageIndex: 3, rotateDeg: 90 },
      { sourcePageIndex: 0, rotateDeg: 180 },
    ]);
    const editedDoc = await PDFDocument.load(await editedBlob.arrayBuffer());
    expect(editedDoc.getPageCount()).toBe(2);
    expect(editedDoc.getPage(0).getRotation().angle).toBe(90);
    expect(editedDoc.getPage(1).getRotation().angle).toBe(180);

    // Split into 2 parts ("1-2, 3-4")
    const parts = await splitPdfByRanges(pdf4File, "1-2, 3-4");
    expect(parts).toHaveLength(2);
    const part1Doc = await PDFDocument.load(await parts[0]!.blob.arrayBuffer());
    const part2Doc = await PDFDocument.load(await parts[1]!.blob.arrayBuffer());
    expect(part1Doc.getPageCount()).toBe(2);
    expect(part2Doc.getPageCount()).toBe(2);

    // Merge 4-page PDF + 2-page PDF -> 6 pages
    const pdf2Bytes = fs.readFileSync(fixtures.sample2PagePdf);
    const pdf2File = new File([pdf2Bytes], "two.pdf", { type: "application/pdf" });
    const mergedBlob = await mergePdfDocuments([pdf4File, pdf2File]);
    const mergedDoc = await PDFDocument.load(await mergedBlob.arrayBuffer());
    expect(mergedDoc.getPageCount()).toBe(6);
  });
});
