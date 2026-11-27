import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPngBuffer, ensureFixtures } from "../fixtures/generateFixtures";
import { inspectImageMetadata, stripJpegBinaryMetadata } from "@/lib/converters/exif";
import { convertImage } from "@/lib/converters/imageConverter";

describe("EXIF scanner and binary stripper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("test_inspectImageMetadata_detects_APP1_EXIF_and_orientation_in_jpeg", async () => {
    const fixtures = await ensureFixtures();
    const normalBytes = fs.readFileSync(fixtures.photoExifJpg);
    const rotatedBytes = fs.readFileSync(fixtures.photoExifRotatedJpg);

    const normalInfo = await inspectImageMetadata(new Blob([normalBytes], { type: "image/jpeg" }));
    expect(normalInfo.hasExif).toBe(true);
    expect(normalInfo.orientation).toBe(1);
    expect(normalInfo.markers).toEqual(expect.arrayContaining(["APP1/EXIF"]));

    const rotatedInfo = await inspectImageMetadata(new Blob([rotatedBytes], { type: "image/jpeg" }));
    expect(rotatedInfo.hasExif).toBe(true);
    expect(rotatedInfo.orientation).toBe(6);
    expect(rotatedInfo.markers).toEqual(expect.arrayContaining(["APP1/EXIF"]));
  });

  it("test_stripJpegBinaryMetadata_removes_APP1_and_COM_preserving_SOI_and_EOI", async () => {
    const fixtures = await ensureFixtures();
    const raw = new Uint8Array(fs.readFileSync(fixtures.photoExifJpg));

    const stripped = stripJpegBinaryMetadata(raw);
    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xd8);
    expect(stripped[stripped.length - 2]).toBe(0xff);
    expect(stripped[stripped.length - 1]).toBe(0xd9);
    expect(Buffer.from(stripped).includes(Buffer.from("Exif", "ascii"))).toBe(false);

    const recheck = await inspectImageMetadata(new Blob([stripped], { type: "image/jpeg" }));
    expect(recheck.hasExif).toBe(false);
    expect(recheck.markers).toEqual([]);
  });

  it("test_inspectImageMetadata_detects_PNG_eXIf_chunk", async () => {
    const basePng = createPngBuffer(4, 4, () => [10, 20, 30, 255]);
    // Insert synthetic eXIf chunk right before IEND (last 12 bytes)
    const iendOffset = basePng.length - 12;
    const exifData = Buffer.from("II*\0\x08\0\0\0\0\0\0\0", "binary");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(exifData.length, 0);
    const chunkType = Buffer.from("eXIf", "ascii");
    const crcPlaceholder = Buffer.alloc(4); // inspectImageMetadata reads chunk header + length
    const pngWithExif = Buffer.concat([
      basePng.subarray(0, iendOffset),
      lenBuf,
      chunkType,
      exifData,
      crcPlaceholder,
      basePng.subarray(iendOffset),
    ]);

    const info = await inspectImageMetadata(new Blob([pngWithExif], { type: "image/png" }));
    expect(info.hasExif).toBe(true);
    expect(info.markers).toContain("eXIf");
  });

  it("test_convertImage_rotated_exif_jpeg_bypasses_binary_fast_path_and_bakes_orientation", async () => {
    const fixtures = await ensureFixtures();
    const rotatedBytes = fs.readFileSync(fixtures.photoExifRotatedJpg);
    const file = new File([rotatedBytes], "photo-exif-rotated.jpg", { type: "image/jpeg" });

    const createBitmapSpy = vi.fn().mockResolvedValue({ width: 8, height: 16, close: vi.fn() });
    vi.stubGlobal("createImageBitmap", createBitmapSpy);

    const encodedJpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
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
          fillStyle: "",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
        };
      }
      convertToBlob = vi.fn().mockResolvedValue(encodedJpeg);
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const out = await convertImage(file, "jpeg", {
      quality: 100,
      width: null,
      height: null,
      maintainAspectRatio: true,
      stripExif: true,
    });

    expect(out).toBe(encodedJpeg);
    expect(createBitmapSpy).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: "from-image",
    });
  });
});
