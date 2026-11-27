export interface RawImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Encodes RGBA pixel data as a standard 24-bit BI_RGB bottom-up Windows Bitmap (BMP),
 * compositing alpha over opaque white (#ffffff) for universal viewer compatibility.
 */
export function encodeBmpFromImageData(imageData: RawImageData): Blob {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid BMP dimensions: ${width}x${height}`);
  }

  // 24-bit RGB rows padded to 4-byte boundaries
  const rowStride = (width * 3 + 3) & ~3;
  const pixelDataSize = rowStride * height;
  const fileSize = 54 + pixelDataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // BITMAPFILEHEADER (14 bytes)
  bytes[0] = 0x42; // 'B'
  bytes[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true); // bfSize
  view.setUint32(6, 0, true); // bfReserved1 + bfReserved2
  view.setUint32(10, 54, true); // bfOffBits

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true); // biSize
  view.setInt32(18, width, true); // biWidth
  view.setInt32(22, height, true); // biHeight (positive = bottom-up)
  view.setUint16(26, 1, true); // biPlanes
  view.setUint16(28, 24, true); // biBitCount
  view.setUint32(30, 0, true); // biCompression (BI_RGB)
  view.setUint32(34, pixelDataSize, true); // biSizeImage
  view.setInt32(38, 2835, true); // biXPelsPerMeter (~72 DPI)
  view.setInt32(42, 2835, true); // biYPelsPerMeter (~72 DPI)
  view.setUint32(46, 0, true); // biClrUsed
  view.setUint32(50, 0, true); // biClrImportant

  // Write pixel rows bottom-up (y = height - 1 down to 0) in BGR order
  for (let y = 0; y < height; y++) {
    const fileRow = height - 1 - y;
    const dstRowOffset = 54 + fileRow * rowStride;
    const srcRowOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      const srcIdx = srcRowOffset + x * 4;
      const dstIdx = dstRowOffset + x * 3;

      const r = data[srcIdx] ?? 0;
      const g = data[srcIdx + 1] ?? 0;
      const b = data[srcIdx + 2] ?? 0;
      const a = (data[srcIdx + 3] ?? 255) / 255;

      // Composite over opaque white (#ffffff)
      const outR = Math.round(r * a + 255 * (1 - a));
      const outG = Math.round(g * a + 255 * (1 - a));
      const outB = Math.round(b * a + 255 * (1 - a));

      bytes[dstIdx] = outB;
      bytes[dstIdx + 1] = outG;
      bytes[dstIdx + 2] = outR;
    }
  }

  return new Blob([buffer], { type: "image/bmp" });
}

/**
 * Wraps PNG bytes in a single-entry Vista+ ICONDIR/ICONDIRENTRY ICO binary (1..256px per axis).
 */
export function encodeIcoFromPngBytes(pngBytes: Uint8Array, width: number, height: number): Blob {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256) {
    throw new Error(`ICO dimensions must be integers between 1 and 256 (got ${width}x${height}).`);
  }

  const headerSize = 6;
  const entrySize = 16;
  const imageOffset = headerSize + entrySize; // 22
  const totalSize = imageOffset + pngBytes.byteLength;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // ICONDIR (6 bytes)
  view.setUint16(0, 0, true); // idReserved = 0
  view.setUint16(2, 1, true); // idType = 1 (ICO)
  view.setUint16(4, 1, true); // idCount = 1

  // ICONDIRENTRY (16 bytes)
  bytes[6] = width === 256 ? 0 : width; // bWidth (0 represents 256)
  bytes[7] = height === 256 ? 0 : height; // bHeight (0 represents 256)
  bytes[8] = 0; // bColorCount
  bytes[9] = 0; // bReserved
  view.setUint16(10, 1, true); // wPlanes
  view.setUint16(12, 32, true); // wBitCount
  view.setUint32(14, pngBytes.byteLength, true); // dwBytesInRes
  view.setUint32(18, imageOffset, true); // dwImageOffset

  bytes.set(pngBytes, imageOffset);

  return new Blob([buffer], { type: "image/x-icon" });
}
