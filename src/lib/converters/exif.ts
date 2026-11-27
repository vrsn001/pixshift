import type { ExifInfo } from "@/types/converter";

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return "";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[offset + i] ?? 0);
  }
  return out;
}

function parseTiffOrientation(bytes: Uint8Array, tiffStart: number, tiffLength: number): number | undefined {
  if (tiffStart + 8 > bytes.length || tiffLength < 8) return undefined;

  const endian0 = bytes[tiffStart] ?? 0;
  const endian1 = bytes[tiffStart + 1] ?? 0;
  const littleEndian = endian0 === 0x49 && endian1 === 0x49; // 'II'
  const bigEndian = endian0 === 0x4d && endian1 === 0x4d; // 'MM'
  if (!littleEndian && !bigEndian) return undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset + tiffStart, tiffLength);
  const magic = view.getUint16(2, littleEndian);
  if (magic !== 0x002a) return undefined;

  const ifd0Offset = view.getUint32(4, littleEndian);
  if (ifd0Offset + 2 > tiffLength) return undefined;

  const entryCount = view.getUint16(ifd0Offset, littleEndian);
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (entryOffset + 12 > tiffLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag === 0x0112) {
      // Orientation (SHORT, 2 bytes)
      const val = view.getUint16(entryOffset + 8, littleEndian);
      return val >= 1 && val <= 8 ? val : undefined;
    }
  }

  return undefined;
}

function inspectJpeg(bytes: Uint8Array): ExifInfo {
  const markers: string[] = [];
  let hasExif = false;
  let hasXmp = false;
  let orientation: number | undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 3 < bytes.length) {
    if ((bytes[offset] ?? 0) !== 0xff) {
      offset++;
      continue;
    }
    while (offset < bytes.length && (bytes[offset] ?? 0) === 0xff) {
      offset++;
    }
    if (offset >= bytes.length) break;

    const marker = bytes[offset] ?? 0;
    offset++;

    // Start of Scan (0xDA) or End of Image (0xD9): stop header scanning
    if (marker === 0xda || marker === 0xd9) break;
    // Standalone markers without length
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      continue;
    }

    if (offset + 2 > bytes.length) break;
    const segLen = view.getUint16(offset, false);
    if (segLen < 2 || offset + segLen > bytes.length) break;

    const payloadOffset = offset + 2;
    const payloadLen = segLen - 2;

    if (marker === 0xe1) {
      const exifHeader = readAscii(bytes, payloadOffset, 6);
      if (exifHeader === "Exif\0\0") {
        hasExif = true;
        markers.push("APP1/EXIF");
        if (orientation === undefined && payloadLen > 6) {
          orientation = parseTiffOrientation(bytes, payloadOffset + 6, payloadLen - 6);
        }
      } else if (readAscii(bytes, payloadOffset, 28) === "http://ns.adobe.com/xap/1.0/") {
        hasXmp = true;
        markers.push("APP1/XMP");
      } else {
        markers.push("APP1");
      }
    } else if (marker === 0xed) {
      hasExif = true;
      markers.push("APP13/IPTC");
    } else if (marker === 0xfe) {
      hasExif = true;
      markers.push("COM");
    }

    offset += segLen;
  }

  return {
    hasExif,
    hasXmp,
    markers: Array.from(new Set(markers)),
    ...(orientation !== undefined ? { orientation } : {}),
  };
}

function inspectPng(bytes: Uint8Array): ExifInfo {
  const markers: string[] = [];
  let hasExif = false;
  let hasXmp = false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let offset = 8; // skip 8-byte PNG signature
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = readAscii(bytes, offset + 4, 4);
    const nextOffset = offset + 12 + length;
    if (nextOffset > bytes.length) break;

    if (type === "eXIf") {
      hasExif = true;
      markers.push("eXIf");
    } else if (type === "iTXt" || type === "tEXt" || type === "zTXt") {
      const header = readAscii(bytes, offset + 8, Math.min(20, length));
      if (header.startsWith("XML:com.adobe.xmp")) {
        hasXmp = true;
        markers.push("XMP");
      }
    } else if (type === "IEND") {
      break;
    }

    offset = nextOffset;
  }

  return { hasExif, hasXmp, markers: Array.from(new Set(markers)) };
}

function inspectWebp(bytes: Uint8Array): ExifInfo {
  const markers: string[] = [];
  let hasExif = false;
  let hasXmp = false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let offset = 12; // skip RIFF + size + WEBP
  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const paddedSize = chunkSize + (chunkSize % 2);
    const nextOffset = offset + 8 + paddedSize;

    if (chunkId === "EXIF") {
      hasExif = true;
      markers.push("RIFF/EXIF");
    } else if (chunkId === "XMP ") {
      hasXmp = true;
      markers.push("RIFF/XMP");
    }

    if (nextOffset <= offset + 8 || nextOffset > bytes.length) break;
    offset = nextOffset;
  }

  return { hasExif, hasXmp, markers: Array.from(new Set(markers)) };
}

/**
 * Inspects JPEG, PNG, and WebP binary headers for EXIF/XMP/IPTC metadata and orientation.
 */
export async function inspectImageMetadata(blob: Blob): Promise<ExifInfo> {
  try {
    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(ab);

    // JPEG SOI: FF D8
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      return inspectJpeg(bytes);
    }

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return inspectPng(bytes);
    }

    // WebP RIFF signature
    if (
      bytes.length >= 16 &&
      readAscii(bytes, 0, 4) === "RIFF" &&
      readAscii(bytes, 8, 4) === "WEBP"
    ) {
      return inspectWebp(bytes);
    }
  } catch {
    // Ignore inspection error on non-standard inputs
  }

  return { hasExif: false, hasXmp: false, markers: [] };
}

/**
 * Losslessly removes APP1 (0xFFE1 EXIF/XMP), APP13 (0xFFED IPTC), and COM (0xFFFE) segments
 * from a JPEG byte buffer while keeping SOI, JFIF APP0, DQT, DHT, SOF, SOS scan data, and EOI intact.
 */
export function stripJpegBinaryMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return new Uint8Array(bytes);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI

  let offset = 2;
  while (offset < bytes.length) {
    if ((bytes[offset] ?? 0) !== 0xff) {
      // Malformed padding or scan data; preserve remainder cleanly
      chunks.push(bytes.subarray(offset));
      break;
    }

    const markerStart = offset;
    while (offset < bytes.length && (bytes[offset] ?? 0) === 0xff) {
      offset++;
    }
    if (offset >= bytes.length) {
      chunks.push(bytes.subarray(markerStart));
      break;
    }

    const marker = bytes[offset] ?? 0;
    offset++;

    // Start of Scan (0xDA) or End of Image (0xD9): preserve exact remainder of stream
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(bytes.subarray(markerStart));
      break;
    }

    // Standalone markers without length
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      chunks.push(bytes.subarray(markerStart, offset));
      continue;
    }

    if (offset + 2 > bytes.length) {
      chunks.push(bytes.subarray(markerStart));
      break;
    }

    const segLen = view.getUint16(offset, false);
    const segEnd = offset + segLen;
    if (segLen < 2 || segEnd > bytes.length) {
      chunks.push(bytes.subarray(markerStart));
      break;
    }

    // Strip APP1 (0xE1 EXIF/XMP), APP13 (0xED IPTC), COM (0xFE)
    const shouldStrip = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!shouldStrip) {
      chunks.push(bytes.subarray(markerStart, segEnd));
    }

    offset = segEnd;
  }

  const totalLen = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(totalLen);
  let writePos = 0;
  for (const chunk of chunks) {
    out.set(chunk, writePos);
    writePos += chunk.byteLength;
  }
  return out;
}
