import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface FixturePaths {
  dir: string;
  samplePng: string;
  transparentLargePng: string;
  photoExifJpg: string;
  photoExifRotatedJpg: string;
  sample2PagePdf: string;
  sampleWav: string;
  sampleWebm: string;
  unknownXyz: string;
  folderDropDir: string;
  folderNestedPng: string;
  folderDsStore: string;
  folderEmptyPng: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_FIXTURES_DIR = path.join(__dirname, "generated");

// Standard IEEE 802.3 CRC32 table for PNG chunk generation
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    const entry = CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0;
    crc = (crc >>> 8) ^ entry;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBytes, Buffer.from(data)]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

export function createPngBuffer(
  width: number,
  height: number,
  pixelFn: (x: number, y: number) => [number, number, number, number]
): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = 1 + width * 4;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const pxOffset = rowOffset + 1 + x * 4;
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    signature,
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", compressed),
    makePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Standard JPEG Annex K DC luminance Huffman table (Table K.3) & AC luminance Huffman table (Table K.5)
const JPEG_STD_DC_LUM_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const JPEG_STD_DC_LUM_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const JPEG_STD_AC_LUM_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
const JPEG_STD_AC_LUM_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

function buildExifApp1Segment(orientation: number): Buffer {
  // Little-endian TIFF header + IFD0 (Make, Model, Orientation)
  const makeStr = Buffer.from("Pixshift\0", "ascii"); // 9 bytes
  const modelStr = Buffer.from("SynthCam\0", "ascii"); // 9 bytes
  const ifdEntryCount = 3;
  const ifdOffset = 8;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const dataOffset = ifdOffset + ifdSize;
  const tiffLen = dataOffset + makeStr.length + modelStr.length;

  const tiff = Buffer.alloc(tiffLen);
  // TIFF header: "II", 0x002A, offset to IFD0 = 8
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(0x002a, 2);
  tiff.writeUInt32LE(ifdOffset, 4);

  // IFD0 entry count
  tiff.writeUInt16LE(ifdEntryCount, ifdOffset);

  const writeIfdEntry = (
    idx: number,
    tag: number,
    type: number,
    count: number,
    valueOrOffset: number
  ) => {
    const pos = ifdOffset + 2 + idx * 12;
    tiff.writeUInt16LE(tag, pos);
    tiff.writeUInt16LE(type, pos + 2);
    tiff.writeUInt32LE(count, pos + 4);
    tiff.writeUInt32LE(valueOrOffset, pos + 8);
  };

  const makePos = dataOffset;
  const modelPos = dataOffset + makeStr.length;
  makeStr.copy(tiff, makePos);
  modelStr.copy(tiff, modelPos);

  // Tags must be sorted in ascending tag order per TIFF 6.0 spec
  writeIfdEntry(0, 0x010f, 2, makeStr.length, makePos); // Make (ASCII)
  writeIfdEntry(1, 0x0110, 2, modelStr.length, modelPos); // Model (ASCII)
  writeIfdEntry(2, 0x0112, 3, 1, orientation); // Orientation (SHORT)

  // Next IFD offset = 0
  tiff.writeUInt32LE(0, ifdOffset + 2 + ifdEntryCount * 12);

  const exifHeader = Buffer.from("Exif\0\0", "ascii");
  const payload = Buffer.concat([exifHeader, tiff]);
  const marker = Buffer.alloc(4);
  marker[0] = 0xff;
  marker[1] = 0xe1;
  marker.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([marker, payload]);
}

function makeJpegSegment(markerByte: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = markerByte;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

export function createExifJpegBuffer(
  width: number,
  height: number,
  orientation = 1
): Buffer {
  const mcuCols = Math.ceil(width / 8);
  const mcuRows = Math.ceil(height / 8);

  // DQT: table 0 with flat quantization value 8
  const dqtPayload = Buffer.alloc(65);
  dqtPayload[0] = 0x00; // 8-bit precision, table id 0
  dqtPayload.fill(8, 1);

  // SOF0: baseline DCT, 8-bit, 3 components (YCbCr 4:4:4)
  const sofPayload = Buffer.alloc(15);
  sofPayload[0] = 8;
  sofPayload.writeUInt16BE(height, 1);
  sofPayload.writeUInt16BE(width, 3);
  sofPayload[5] = 3;
  // Y, Cb, Cr
  sofPayload[6] = 1;
  sofPayload[7] = 0x11;
  sofPayload[8] = 0;
  sofPayload[9] = 2;
  sofPayload[10] = 0x11;
  sofPayload[11] = 0;
  sofPayload[12] = 3;
  sofPayload[13] = 0x11;
  sofPayload[14] = 0;

  // DHT DC table 0 + AC table 0
  const dhtDcPayload = Buffer.from([
    0x00,
    ...JPEG_STD_DC_LUM_BITS,
    ...JPEG_STD_DC_LUM_VALS,
  ]);
  const dhtAcPayload = Buffer.from([
    0x10,
    ...JPEG_STD_AC_LUM_BITS,
    ...JPEG_STD_AC_LUM_VALS,
  ]);

  // SOS: 3 components, all mapped to DC 0 / AC 0
  const sosPayload = Buffer.from([
    3,
    1,
    0x00,
    2,
    0x00,
    3,
    0x00,
    0,
    63,
    0,
  ]);

  // Bitwriter for entropy-coded scan data (all blocks DC diff = 0 -> code 00, AC = EOB -> code 1010)
  // Using Table K.3 symbol 0 => 2 bits '00'; Table K.5 symbol 0x00 (EOB) => 4 bits '1010'.
  // Give the first MCU block a subtle DC offset (category 5: 3-bit code '110' + 5-bit val '10000' = +16)
  // so it encodes a visible cobalt/neutral tint rather than flat gray.
  const bits: number[] = [];
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  const totalMcus = mcuCols * mcuRows;
  for (let m = 0; m < totalMcus; m++) {
    for (let comp = 0; comp < 3; comp++) {
      if (m === 0 && comp === 2) {
        // Slight positive Cr/Cb shift on block 0: DC category 4 ('101' + '1010' = +10)
        pushBits(0b101, 3);
        pushBits(0b1010, 4);
      } else {
        // DC diff = 0 -> '00'
        pushBits(0b00, 2);
      }
      // AC EOB -> '1010'
      pushBits(0b1010, 4);
    }
  }

  while (bits.length % 8 !== 0) {
    bits.push(1);
  }

  const scanBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | (bits[i + j] ?? 1);
    }
    scanBytes.push(b);
    if (b === 0xff) {
      scanBytes.push(0x00);
    }
  }

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    buildExifApp1Segment(orientation), // APP1 EXIF
    makeJpegSegment(0xdb, dqtPayload), // DQT
    makeJpegSegment(0xc0, sofPayload), // SOF0
    makeJpegSegment(0xc4, dhtDcPayload), // DHT DC
    makeJpegSegment(0xc4, dhtAcPayload), // DHT AC
    makeJpegSegment(0xda, sosPayload), // SOS
    Buffer.from(scanBytes),
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

export function createWavBuffer(
  durationSec = 0.25,
  sampleRate = 44100,
  freqHz = 440
): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE((sampleRate * numChannels * bitsPerSample) / 8, 28);
  buffer.writeUInt16LE((numChannels * bitsPerSample) / 8, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(
      Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * 16000
    );
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  return buffer;
}

// 4 real 64x64 VP8 intra keyframes (blue/acid-lime alternating blocks, ~110 bytes each)
const VP8_KEYFRAMES_64X64_BASE64 = [
  "EAYAnQEqQABAAAAHCIWFiJmEiAEkEA7hfgP4A/pXzDOgvYH9Zs77Ir7Kujqqyh3j6tIu06xYmw9sAP76eV///7fYJ9JWPv//sDcuZTtf//i4R5G0asExHYFP717+vS4P/OoDE8Ib1RkaGzgzCX+dsAA=",
  "UAYAnQEqQABAAAAHCIWFiJmEiAEkEBOt5x+q8B/E/9VeMF7u/pLnfkD6h0S7ugu7p+1iJP/YqTa86R4A/v+qJtbl+P/vBGt//kmOsscE23/lM9vkcNUJksDBicD6LqvjyIypSXPN4Kyx0AA=",
  "MAYAnQEqQABAAAAHCIWFiJmEiAEkEBlsqF/Afwr1zvgP4QfpLxgvJnnfZFfZV4b/2svg5Q03VzRwhAD++nlRoB6jqilAu9xKloVv//xcIxrOaRGsqH/Jv6oZDxgv/Yb4P7pL4j69yqATHFaQeP+dsAA=",
  "UAYAnQEqQABAAAAHCIWFiJmEiAEkEBOt5x+q8B/E/9VeMF7u/pLnfkD6h0S7u6C7un7WIk/9ipNrzowA/v+qJtbl+P/vBGt//kmOsscE23/lM9vkcNUJksDBicD6LqvjyIypSXPN4Kyx0AA=",
];

function ebmlVintSize(len: number): Buffer {
  if (len < 0x7f) {
    return Buffer.from([0x80 | len]);
  }
  if (len < 0x3fff) {
    return Buffer.from([0x40 | (len >> 8), len & 0xff]);
  }
  if (len < 0x1fffff) {
    return Buffer.from([0x20 | (len >> 16), (len >> 8) & 0xff, len & 0xff]);
  }
  return Buffer.from([
    0x10 | (len >> 24),
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
  ]);
}

function ebmlElement(idBytes: number[], payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from(idBytes), ebmlVintSize(payload.length), payload]);
}

function ebmlUint(idBytes: number[], value: number): Buffer {
  if (value === 0) {
    return ebmlElement(idBytes, Buffer.from([0x00]));
  }
  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return ebmlElement(idBytes, Buffer.from(bytes));
}

function ebmlFloat64(idBytes: number[], value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeDoubleBE(value, 0);
  return ebmlElement(idBytes, buf);
}

function ebmlString(idBytes: number[], value: string): Buffer {
  return ebmlElement(idBytes, Buffer.from(value, "ascii"));
}

export function createWebmBuffer(): Buffer {
  const width = 64;
  const height = 64;
  const frameStepMs = 200;
  const frames = VP8_KEYFRAMES_64X64_BASE64.map((b64) => Buffer.from(b64, "base64"));
  const durationMs = frames.length * frameStepMs; // 800 ms (0.8s)

  const ebmlHeader = ebmlElement(
    [0x1a, 0x45, 0xdf, 0xa3],
    Buffer.concat([
      ebmlUint([0x42, 0x86], 1), // EBMLVersion
      ebmlUint([0x42, 0xf7], 1), // EBMLReadVersion
      ebmlUint([0x42, 0xf2], 4), // EBMLMaxIDLength
      ebmlUint([0x42, 0xf3], 8), // EBMLMaxSizeLength
      ebmlString([0x42, 0x82], "webm"), // DocType
      ebmlUint([0x42, 0x87], 4), // DocTypeVersion
      ebmlUint([0x42, 0x85], 2), // DocTypeReadVersion
    ])
  );

  const segmentInfo = ebmlElement(
    [0x15, 0x49, 0xa9, 0x66],
    Buffer.concat([
      ebmlUint([0x2a, 0xd7, 0xb1], 1_000_000), // TimecodeScale = 1ms
      ebmlString([0x4d, 0x80], "Pixshift"), // MuxingApp
      ebmlString([0x57, 0x41], "Pixshift"), // WritingApp
      ebmlFloat64([0x44, 0x89], durationMs), // Duration = 800.0 ms
    ])
  );

  const videoSettings = ebmlElement(
    [0xe0],
    Buffer.concat([
      ebmlUint([0xb0], width), // PixelWidth
      ebmlUint([0xba], height), // PixelHeight
    ])
  );

  const trackEntry = ebmlElement(
    [0xae],
    Buffer.concat([
      ebmlUint([0xd7], 1), // TrackNumber = 1
      ebmlUint([0x73, 0xc5], 1), // TrackUID = 1
      ebmlUint([0x83], 1), // TrackType = 1 (video)
      ebmlString([0x86], "V_VP8"), // CodecID
      ebmlUint([0x23, 0xe3, 0x83], frameStepMs * 1_000_000), // DefaultDuration = 200ms in ns
      videoSettings,
    ])
  );

  const tracks = ebmlElement([0x16, 0x54, 0xae, 0x6b], trackEntry);

  const simpleBlocks = frames.map((frame, index) => {
    const timecode = index * frameStepMs;
    const header = Buffer.alloc(4);
    header[0] = 0x81; // VINT track number 1
    header.writeInt16BE(timecode, 1);
    header[3] = 0x80; // Keyframe flag
    return ebmlElement([0xa3], Buffer.concat([header, frame]));
  });

  const cluster = ebmlElement(
    [0x1f, 0x43, 0xb6, 0x75],
    Buffer.concat([
      ebmlUint([0xe7], 0), // Cluster Timecode = 0
      ...simpleBlocks,
    ])
  );

  const segment = ebmlElement(
    [0x18, 0x53, 0x80, 0x67],
    Buffer.concat([segmentInfo, tracks, cluster])
  );

  return Buffer.concat([ebmlHeader, segment]);
}

async function createTwoPagePdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("Pixshift Synthetic 2-Page Fixture");
  doc.setCreator("Pixshift Fixture Generator");
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));

  const font = await doc.embedFont(StandardFonts.Helvetica);

  const page1 = doc.addPage([300, 200]);
  page1.drawRectangle({
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    color: rgb(0.07, 0.07, 0.09),
  });
  page1.drawRectangle({
    x: 24,
    y: 24,
    width: 252,
    height: 152,
    color: rgb(0.15, 0.39, 0.92),
  });
  page1.drawText("Pixshift Fixture Page 1", {
    x: 44,
    y: 95,
    size: 16,
    font,
    color: rgb(1, 1, 1),
  });

  const page2 = doc.addPage([300, 200]);
  page2.drawRectangle({
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    color: rgb(0.07, 0.07, 0.09),
  });
  page2.drawRectangle({
    x: 24,
    y: 24,
    width: 252,
    height: 152,
    color: rgb(0.78, 0.94, 0.24),
  });
  page2.drawText("Pixshift Fixture Page 2", {
    x: 44,
    y: 95,
    size: 16,
    font,
    color: rgb(0.05, 0.05, 0.06),
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

export async function ensureFixtures(
  dir: string = DEFAULT_FIXTURES_DIR
): Promise<FixturePaths> {
  const folderDropDir = path.join(dir, "folder-drop");
  const folderSubDir = path.join(folderDropDir, "sub");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(folderSubDir, { recursive: true });

  const paths: FixturePaths = {
    dir,
    samplePng: path.join(dir, "sample.png"),
    transparentLargePng: path.join(dir, "transparent-large.png"),
    photoExifJpg: path.join(dir, "photo-exif.jpg"),
    photoExifRotatedJpg: path.join(dir, "photo-exif-rotated.jpg"),
    sample2PagePdf: path.join(dir, "sample-2page.pdf"),
    sampleWav: path.join(dir, "sample.wav"),
    sampleWebm: path.join(dir, "sample.webm"),
    unknownXyz: path.join(dir, "unknown.xyz"),
    folderDropDir,
    folderNestedPng: path.join(folderSubDir, "nested.png"),
    folderDsStore: path.join(folderDropDir, ".DS_Store"),
    folderEmptyPng: path.join(folderDropDir, "empty.png"),
  };

  // 16x16 opaque RGBA PNG
  const samplePngBuf = createPngBuffer(16, 16, (x, y) => [
    (x * 16) & 0xff,
    (y * 16) & 0xff,
    220,
    255,
  ]);
  fs.writeFileSync(paths.samplePng, samplePngBuf);

  // 512x384 RGBA PNG with transparent outer border (for BMP white-matte + ICO 256x192 scale tests)
  const largePngBuf = createPngBuffer(512, 384, (x, y) => {
    const isCornerOrBorder = x < 64 || y < 48 || x >= 448 || y >= 336;
    if (isCornerOrBorder) {
      return [0, 0, 0, 0];
    }
    return [37, 99, 235, 255];
  });
  fs.writeFileSync(paths.transparentLargePng, largePngBuf);

  // Valid minimal JPEGs with injected APP1 EXIF segment
  fs.writeFileSync(paths.photoExifJpg, createExifJpegBuffer(16, 16, 1));
  fs.writeFileSync(paths.photoExifRotatedJpg, createExifJpegBuffer(16, 8, 6));

  // Valid 2-page PDF
  fs.writeFileSync(paths.sample2PagePdf, await createTwoPagePdfBuffer());

  // Valid 0.25s 44.1kHz PCM WAV
  fs.writeFileSync(paths.sampleWav, createWavBuffer(0.25, 44100, 440));

  // Genuine playable WebM/VP8 clip (~0.8s, 4 keyframes)
  fs.writeFileSync(paths.sampleWebm, createWebmBuffer());

  // Non-media unknown payload
  fs.writeFileSync(
    paths.unknownXyz,
    Buffer.from("PIXSHIFT_UNSUPPORTED_FIXTURE_PAYLOAD_0001", "utf8")
  );

  // Folder drop fixtures: nested valid PNG + dotfile + 0-byte file
  fs.writeFileSync(
    paths.folderNestedPng,
    createPngBuffer(8, 8, () => [200, 240, 60, 255])
  );
  fs.writeFileSync(paths.folderDsStore, Buffer.from("Bud1", "ascii"));
  fs.writeFileSync(paths.folderEmptyPng, Buffer.alloc(0));

  return paths;
}

const isCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isCli) {
  ensureFixtures()
    .then((paths) => {
      console.log(`Generated synthetic fixtures in ${paths.dir}`);
    })
    .catch((err) => {
      console.error("Failed to generate fixtures:", err);
      process.exitCode = 1;
    });
}
