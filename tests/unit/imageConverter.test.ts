import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertImage } from "@/lib/converters/imageConverter";
import type { ConversionSettings } from "@/types/converter";

const defaultSettings: ConversionSettings = {
  quality: 85,
  width: null,
  height: null,
  maintainAspectRatio: true,
  stripExif: true,
};

describe("imageConverter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("test_convertImage_avif_throws_when_canvas_silently_returns_png", async () => {
    const bitmap = { width: 16, height: 16, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const convertToBlobMock = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }));

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return {
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
          fillStyle: "#000000",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        };
      }
      convertToBlob = convertToBlobMock;
    }

    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "sample.png", { type: "image/png" });
    await expect(convertImage(file, "avif", defaultSettings)).rejects.toThrow(/AVIF encoding is not supported/i);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("test_convertImage_ico_scales_oversized_512x384_to_256x192", async () => {
    const bitmap = { width: 512, height: 384, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const pngPayload = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7]);
    const canvasDims: { width: number; height: number }[] = [];

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        canvasDims.push({ width: w, height: h });
      }
      getContext() {
        return {
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
          fillStyle: "#000000",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        };
      }
      convertToBlob = vi.fn().mockResolvedValue(new Blob([pngPayload], { type: "image/png" }));
    }

    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const file = new File([new Uint8Array([1, 2, 3, 4])], "large.png", { type: "image/png" });
    const out = await convertImage(file, "ico", defaultSettings);
    expect(canvasDims).toContainEqual({ width: 256, height: 192 });
    expect(out.type).toBe("image/x-icon");

    const buf = Buffer.from(await out.arrayBuffer());
    expect([...buf.subarray(0, 6)]).toEqual([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
    expect(buf[6]).toBe(0); // 256
    expect(buf[7]).toBe(192);
    expect(buf.readUInt32LE(18)).toBe(22);
    expect([...buf.subarray(22)]).toEqual([...pngPayload]);
  });

  it("test_convertImage_heic_empty_array_guard", async () => {
    vi.doMock("heic2any", () => ({
      default: vi.fn().mockResolvedValue([]),
    }));
    const bitmap = { width: 10, height: 10, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    class MockOffscreenCanvas {
      width = 10;
      height = 10;
      getContext() {
        return { imageSmoothingEnabled: true, drawImage: vi.fn() };
      }
      convertToBlob = vi.fn().mockResolvedValue(new Blob([new Uint8Array([1])], { type: "image/png" }));
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const file = new File([new Uint8Array([1, 2, 3])], "photo.heic", { type: "image/heic" });
    const blob = await convertImage(file, "png", defaultSettings);
    expect(blob.type).toBe("image/png");
    vi.doUnmock("heic2any");
  });

  it("test_convertImage_applies_rotate_and_crop_dimensions", async () => {
    const bitmap = { width: 400, height: 200, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const canvasDims: { width: number; height: number }[] = [];
    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        canvasDims.push({ width: w, height: h });
      }
      getContext() {
        return {
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
          fillStyle: "#000000",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
        };
      }
      convertToBlob = vi
        .fn()
        .mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const file = new File([new Uint8Array([1, 2])], "wide.png", { type: "image/png" });
    await convertImage(file, "png", {
      ...defaultSettings,
      crop: { x: 10, y: 0, width: 50, height: 100, unit: "percent" }, // 200x200
      rotateDeg: 90,
      width: 120,
      height: 120,
      maintainAspectRatio: true,
    });

    // Cropped + rotated 90° then resized cleanly to 120x120
    expect(canvasDims.some((d) => d.width === 120 && d.height === 120)).toBe(true);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("test_convertImageWithMeta_targetSizeKb_binary_search_and_warning", async () => {
    const { convertImageWithMeta } = await import("@/lib/converters/imageConverter");
    const bitmap = { width: 300, height: 200, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    class MockOffscreenCanvas {
      width = 300;
      height = 200;
      getContext() {
        return {
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
          fillStyle: "#000000",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
        };
      }
      convertToBlob = vi.fn(async (opts: { quality?: number }) => {
        const q = opts?.quality ?? 0.85;
        // Simulate file size proportional to quality: q=0.5 -> 5000 bytes (~4.9 KB)
        const byteCount = Math.max(2048, Math.round(q * 10000));
        return new Blob([new Uint8Array(byteCount)], { type: "image/webp" });
      });
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const file = new File([new Uint8Array([1, 2])], "photo.png", { type: "image/png" });

    // Reachable target: 6 KB (6144 bytes)
    const ok = await convertImageWithMeta(file, "webp", {
      ...defaultSettings,
      targetSizeKb: 6,
    });
    expect(ok.blob.size).toBeLessThanOrEqual(6 * 1024);
    expect(ok.targetUnreachableWarning).toBeUndefined();

    // Unreachable target: 1 KB (canvas floor is 2048 bytes) -> warns cleanly
    const warn = await convertImageWithMeta(file, "webp", {
      ...defaultSettings,
      targetSizeKb: 1,
    });
    expect(warn.targetUnreachableWarning).toMatch(/could not compress/i);
  });

  it("test_convertImage_watermark_draws_text_overlay", async () => {
    const bitmap = { width: 400, height: 300, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const fillTextSpy = vi.fn();

    class MockOffscreenCanvas {
      width = 400;
      height = 300;
      getContext() {
        return {
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
          fillStyle: "#000000",
          globalAlpha: 1,
          font: "",
          textAlign: "left",
          textBaseline: "top",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          fillText: fillTextSpy,
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
        };
      }
      convertToBlob = vi
        .fn()
        .mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }));
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const file = new File([new Uint8Array([1, 2])], "pic.png", { type: "image/png" });
    await convertImage(file, "webp", {
      ...defaultSettings,
      watermark: {
        enabled: true,
        mode: "text",
        text: "PIXSHIFT",
        position: "bottom-right",
        opacity: 0.6,
        scale: 1,
      },
    });

    expect(fillTextSpy).toHaveBeenCalled();
    expect(fillTextSpy.mock.calls[0]?.[0]).toBe("PIXSHIFT");
  });
});
