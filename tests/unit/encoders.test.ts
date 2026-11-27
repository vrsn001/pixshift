import { describe, expect, it } from "vitest";
import { encodeBmpFromImageData, encodeIcoFromPngBytes } from "@/lib/converters/encoders";

describe("binary image encoders", () => {
  it("test_encodeBmpFromImageData_writes_valid_24bit_BM_header_and_white_alpha_composite", async () => {
    // 3x2 image:
    // top row (y=0): (255,0,0,255) red, (0,0,0,0) transparent, (0,255,0,255) green
    // bottom row (y=1): (0,0,255,255) blue, (0,0,0,128) ~50% translucent, (255,255,255,255) white
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 0, 0, 0,
      0, 255, 0, 255,
      0, 0, 255, 255,
      0, 0, 0, 128,
      255, 255, 255, 255,
    ]);

    const blob = encodeBmpFromImageData({ width: 3, height: 2, data });
    expect(blob.type).toBe("image/bmp");

    const buf = Buffer.from(await blob.arrayBuffer());
    // 3 px * 3 bytes = 9 bytes per row -> padded to 12 bytes per row; 2 rows = 24 bytes
    expect(buf.length).toBe(54 + 24);
    expect(buf[0]).toBe(0x42); // 'B'
    expect(buf[1]).toBe(0x4d); // 'M'
    expect(buf.readUInt32LE(2)).toBe(54 + 24);
    expect(buf.readUInt32LE(10)).toBe(54); // bfOffBits
    expect(buf.readUInt32LE(14)).toBe(40); // biSize
    expect(buf.readInt32LE(18)).toBe(3); // biWidth
    expect(buf.readInt32LE(22)).toBe(2); // biHeight (positive = bottom-up)
    expect(buf.readUInt16LE(26)).toBe(1); // biPlanes
    expect(buf.readUInt16LE(28)).toBe(24); // biBitCount
    expect(buf.readUInt32LE(34)).toBe(24); // biSizeImage

    // Top-left (x=0, y=0) is stored in file row 1 (bottom-up): offset = 54 + 12 = 66, BGR = 0,0,255
    expect(buf[66]).toBe(0);
    expect(buf[67]).toBe(0);
    expect(buf[68]).toBe(255);

    // Top-middle (x=1, y=0) transparent -> composited onto white (255, 255, 255)
    expect(buf[69]).toBe(255);
    expect(buf[70]).toBe(255);
    expect(buf[71]).toBe(255);

    // Bottom-left (x=0, y=1) is stored in file row 0: offset = 54, blue (BGR = 255,0,0)
    expect(buf[54]).toBe(255);
    expect(buf[55]).toBe(0);
    expect(buf[56]).toBe(0);
  });

  it("test_encodeIcoFromPngBytes_writes_valid_ICONDIR_header_and_png_payload", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const blob = encodeIcoFromPngBytes(pngBytes, 256, 192);
    expect(blob.type).toBe("image/x-icon");

    const buf = Buffer.from(await blob.arrayBuffer());
    expect(buf.length).toBe(22 + pngBytes.length);
    // ICONDIR
    expect([...buf.subarray(0, 6)]).toEqual([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
    // ICONDIRENTRY
    expect(buf[6]).toBe(0); // 256 encoded as 0 in ICO spec
    expect(buf[7]).toBe(192);
    expect(buf[8]).toBe(0);
    expect(buf[9]).toBe(0);
    expect(buf.readUInt16LE(10)).toBe(1); // planes
    expect(buf.readUInt16LE(12)).toBe(32); // bpp
    expect(buf.readUInt32LE(14)).toBe(pngBytes.length);
    expect(buf.readUInt32LE(18)).toBe(22);
    expect([...buf.subarray(22)]).toEqual([...pngBytes]);
  });

  it("test_encodeIcoFromPngBytes_rejects_dimensions_over_256", () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(() => encodeIcoFromPngBytes(pngBytes, 300, 128)).toThrow(/256/);
    expect(() => encodeIcoFromPngBytes(pngBytes, 0, 16)).toThrow();
  });
});
