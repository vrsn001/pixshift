import fs from "node:fs";
import path from "node:path";
import { expect, type Download, type Locator, type Page } from "@playwright/test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { ensureFixtures, type FixturePaths } from "../fixtures/generateFixtures";

export type { FixturePaths };

export async function getFixtures(): Promise<FixturePaths> {
  return ensureFixtures();
}

export interface RecordedRequest {
  url: string;
  method: string;
  resourceType: string;
}

export interface ZeroUploadOptions {
  /** Allowed HTTP(S) origins. Defaults to ["http://127.0.0.1:3000", "http://localhost:3000"]. */
  allowedOrigins?: string[];
  /** If true (default), also fail if any http(s) request uses POST, PUT, PATCH, or DELETE. */
  forbidMutationMethods?: boolean;
}

export interface RuntimeMonitor {
  pageErrors: string[];
  consoleErrors: string[];
  requestUrls: string[];
  requests: RecordedRequest[];
  assertClean: (options?: { allowConsolePatterns?: RegExp[] }) => void;
  assertZeroUnpkg: () => void;
  assertZeroExternalUploads: (options?: ZeroUploadOptions) => void;
}

export function assertZeroExternalUploads(
  monitor: Pick<RuntimeMonitor, "requestUrls"> & { requests?: RecordedRequest[] },
  options?: ZeroUploadOptions
): void {
  const allowedOrigins = new Set(
    options?.allowedOrigins ?? ["http://127.0.0.1:3000", "http://localhost:3000"]
  );
  const forbidMutations = options?.forbidMutationMethods !== false;
  const violations: string[] = [];

  for (const url of monitor.requestUrls) {
    if (url.startsWith("blob:") || url.startsWith("data:")) {
      continue;
    }
    try {
      const parsed = new URL(url);
      if (!allowedOrigins.has(parsed.origin)) {
        violations.push(`External origin request: ${url}`);
      }
    } catch {
      violations.push(`Unparseable request URL: ${url}`);
    }
  }

  if (forbidMutations && monitor.requests) {
    const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
    for (const req of monitor.requests) {
      if (
        (req.url.startsWith("http://") || req.url.startsWith("https://")) &&
        mutationMethods.has(req.method.toUpperCase())
      ) {
        violations.push(`Forbidden mutation request (${req.method}): ${req.url}`);
      }
    }
  }

  expect(
    violations,
    `External upload or mutation request(s) detected: ${violations.join(" | ")}`
  ).toEqual([]);
}

export function attachRuntimeMonitor(page: Page): RuntimeMonitor {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const requestUrls: string[] = [];
  const requests: RecordedRequest[] = [];

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("request", (req) => {
    const url = req.url();
    requestUrls.push(url);
    requests.push({
      url,
      method: req.method(),
      resourceType: req.resourceType(),
    });
  });

  const monitor: RuntimeMonitor = {
    pageErrors,
    consoleErrors,
    requestUrls,
    requests,
    assertClean(options?: { allowConsolePatterns?: RegExp[] }) {
      expect(pageErrors, `Unexpected pageerror(s): ${pageErrors.join(" | ")}`).toEqual([]);
      const allow = options?.allowConsolePatterns ?? [];
      const unexpectedConsole = consoleErrors.filter(
        (msg) => !allow.some((pattern) => pattern.test(msg))
      );
      expect(
        unexpectedConsole,
        `Unexpected console.error(s): ${unexpectedConsole.join(" | ")}`
      ).toEqual([]);
    },
    assertZeroUnpkg() {
      const unpkgRequests = requestUrls.filter((u) => u.toLowerCase().includes("unpkg.com"));
      expect(
        unpkgRequests,
        `Forbidden unpkg.com request(s): ${unpkgRequests.join(", ")}`
      ).toEqual([]);
    },
    assertZeroExternalUploads(options?: ZeroUploadOptions) {
      assertZeroExternalUploads(monitor, options);
    },
  };

  return monitor;
}

export interface BlobUrlRecord {
  url: string;
  type: string;
  size: number;
}

export interface BlobSpyState {
  created: BlobUrlRecord[];
  revoked: string[];
}

interface WindowWithBlobSpy extends Window {
  __pixshiftBlobSpy?: BlobSpyState;
}

export async function installBlobUrlSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as WindowWithBlobSpy;
    const state: BlobSpyState = { created: [], revoked: [] };
    win.__pixshiftBlobSpy = state;

    const origCreate = URL.createObjectURL.bind(URL);
    const origRevoke = URL.revokeObjectURL.bind(URL);

    URL.createObjectURL = (obj: Blob | MediaSource): string => {
      const url = origCreate(obj);
      if (obj instanceof Blob) {
        state.created.push({ url, type: obj.type, size: obj.size });
      } else {
        state.created.push({ url, type: "media-source", size: 0 });
      }
      return url;
    };

    URL.revokeObjectURL = (url: string): void => {
      state.revoked.push(url);
      origRevoke(url);
    };
  });
}

export async function getBlobSpyState(page: Page): Promise<BlobSpyState> {
  return page.evaluate(() => {
    const win = window as WindowWithBlobSpy;
    return win.__pixshiftBlobSpy ?? { created: [], revoked: [] };
  });
}

export async function readDownloadBuffer(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (stream) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  const filePath = await download.path();
  if (!filePath) {
    throw new Error(`Download "${download.suggestedFilename()}" has neither stream nor path`);
  }
  return fs.readFileSync(filePath);
}

export async function assertPdfBuffer(buf: Buffer, expectedPages?: number): Promise<void> {
  expect(buf.length).toBeGreaterThan(20);
  expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const doc = await PDFDocument.load(buf);
  if (expectedPages !== undefined) {
    expect(doc.getPageCount()).toBe(expectedPages);
  } else {
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  }
}

export function assertBmpBuffer(
  buf: Buffer,
  expectedWidth: number,
  expectedHeight: number
): void {
  expect(buf.length).toBeGreaterThanOrEqual(54);
  expect(buf[0]).toBe(0x42); // 'B'
  expect(buf[1]).toBe(0x4d); // 'M'
  const bfOffBits = buf.readUInt32LE(10);
  expect(bfOffBits).toBe(54);
  const biSize = buf.readUInt32LE(14);
  expect(biSize).toBe(40);
  const biWidth = buf.readInt32LE(18);
  const biHeight = buf.readInt32LE(22);
  expect(biWidth).toBe(expectedWidth);
  expect(Math.abs(biHeight)).toBe(expectedHeight);
  const biBitCount = buf.readUInt16LE(28);
  expect(biBitCount).toBe(24);

  const rowStride = (expectedWidth * 3 + 3) & ~3;
  const expectedMinSize = 54 + rowStride * expectedHeight;
  expect(buf.length).toBeGreaterThanOrEqual(expectedMinSize);
}

export function readBmpPixel(
  buf: Buffer,
  x: number,
  y: number
): { r: number; g: number; b: number } {
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const height = Math.abs(rawHeight);
  const isBottomUp = rawHeight > 0;
  const rowStride = (width * 3 + 3) & ~3;
  const fileRow = isBottomUp ? height - 1 - y : y;
  const offset = 54 + fileRow * rowStride + x * 3;
  const b = buf[offset] ?? 0;
  const g = buf[offset + 1] ?? 0;
  const r = buf[offset + 2] ?? 0;
  return { r, g, b };
}

export function assertIcoBuffer(
  buf: Buffer,
  expectedWidth: number,
  expectedHeight: number
): void {
  expect(buf.length).toBeGreaterThan(22 + 8);
  expect(buf.readUInt16LE(0)).toBe(0); // reserved
  expect(buf.readUInt16LE(2)).toBe(1); // type = icon
  expect(buf.readUInt16LE(4)).toBe(1); // count = 1

  const bWidth = buf[6] ?? -1;
  const bHeight = buf[7] ?? -1;
  expect(bWidth).toBe(expectedWidth === 256 ? 0 : expectedWidth);
  expect(bHeight).toBe(expectedHeight === 256 ? 0 : expectedHeight);

  const dwBytesInRes = buf.readUInt32LE(14);
  const dwImageOffset = buf.readUInt32LE(18);
  expect(dwImageOffset).toBe(22);
  expect(buf.length).toBe(22 + dwBytesInRes);

  // Embedded PNG signature
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < pngSig.length; i++) {
    expect(buf[22 + i]).toBe(pngSig[i]);
  }
}

export function parsePngDimensions(buf: Buffer): { width: number; height: number } {
  expect(buf.length).toBeGreaterThanOrEqual(24);
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < pngSig.length; i++) {
    expect(buf[i]).toBe(pngSig[i]);
  }
  expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

export function assertWebpBuffer(buf: Buffer): void {
  expect(buf.length).toBeGreaterThan(16);
  expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(buf.subarray(8, 12).toString("ascii")).toBe("WEBP");
}

export function isPngBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

export function assertAvifBuffer(buf: Buffer): void {
  expect(isPngBuffer(buf)).toBe(false);
  expect(buf.length).toBeGreaterThan(16);
  expect(buf.subarray(4, 8).toString("ascii")).toBe("ftyp");
  const brand = buf.subarray(8, 12).toString("ascii");
  expect(["avif", "avis", "mif1"]).toContain(brand);
}

export function assertJpegValid(buf: Buffer): void {
  expect(buf.length).toBeGreaterThan(20);
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  expect(buf[buf.length - 2]).toBe(0xff);
  expect(buf[buf.length - 1]).toBe(0xd9);
}

export function assertJpegStripped(buf: Buffer): void {
  assertJpegValid(buf);
  expect(buf.includes(Buffer.from("Exif", "ascii"))).toBe(false);

  // Walk JPEG marker segments before SOS (0xFFDA) and confirm no 0xFFE1 APP1 marker remains
  let offset = 2;
  while (offset + 3 < buf.length) {
    const prefix = buf[offset] ?? 0;
    const marker = buf[offset + 1] ?? 0;
    if (prefix !== 0xff) {
      break;
    }
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    expect(marker).not.toBe(0xe1);
    const segLen = buf.readUInt16BE(offset + 2);
    expect(segLen).toBeGreaterThanOrEqual(2);
    offset += 2 + segLen;
  }
}

export function parseJpegDimensions(buf: Buffer): { width: number; height: number } {
  assertJpegValid(buf);
  let offset = 2;
  while (offset + 8 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1] ?? 0;
    // Standalone markers without length
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const segLen = buf.readUInt16BE(offset + 2);
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && offset + 9 < buf.length) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + segLen;
  }
  throw new Error("Could not find SOF marker in JPEG buffer");
}

export function assertMp3Buffer(buf: Buffer): void {
  expect(buf.length).toBeGreaterThan(100);
  const hasId3 = buf.subarray(0, 3).toString("ascii") === "ID3";
  const hasMpegSync = (buf[0] ?? 0) === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0;
  expect(hasId3 || hasMpegSync).toBe(true);
}

export function assertMp4OrWebmBuffer(buf: Buffer): void {
  expect(buf.length).toBeGreaterThan(100);
  const isMp4 = buf.subarray(4, 8).toString("ascii") === "ftyp";
  const isWebm =
    buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  expect(isMp4 || isWebm).toBe(true);
}

export async function readZipEntries(buf: Buffer): Promise<Map<string, Buffer>> {
  const zip = await JSZip.loadAsync(buf);
  const entries = new Map<string, Buffer>();
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) {
      const content = await entry.async("nodebuffer");
      entries.set(name, content);
    }
  }
  return entries;
}

export function parseCssColor(css: string): { r: number; g: number; b: number; a: number } {
  const match = css.match(
    /rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i
  );
  if (!match) {
    throw new Error(`Unsupported CSS color format: ${css}`);
  }
  return {
    r: Number(match[1] ?? 0),
    g: Number(match[2] ?? 0),
    b: Number(match[3] ?? 0),
    a: match[4] !== undefined ? Number(match[4]) : 1,
  };
}

export function compositeOver(
  fg: { r: number; g: number; b: number; a: number },
  bg: { r: number; g: number; b: number }
): { r: number; g: number; b: number } {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const toLinear = (c: number) => {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

export function contrastRatio(
  fg: { r: number; g: number; b: number },
  bg: { r: number; g: number; b: number }
): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export async function uploadFiles(page: Page, filePaths: string | string[]): Promise<void> {
  const fileInput = page
    .locator('input[type="file"][aria-label="Select files"]')
    .or(page.locator('input[type="file"]:not([webkitdirectory])'))
    .first();
  await fileInput.setInputFiles(filePaths);
}

export async function uploadFolder(page: Page, dirPath: string): Promise<void> {
  const folderInput = page
    .locator('input[type="file"][aria-label="Select folder"]')
    .or(page.locator('input[type="file"][webkitdirectory]'))
    .first();
  await folderInput.setInputFiles(dirPath);
}

export function queueRow(page: Page, fileName: string): Locator {
  return page
    .locator("div")
    .filter({ has: page.getByText(fileName, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: /remove/i }) })
    .last();
}

export function queueRows(page: Page, fileName: string): Locator {
  return page
    .locator("div")
    .filter({ has: page.getByText(fileName, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: /remove/i }) });
}

export async function selectFormatOnRow(
  page: Page,
  row: Locator,
  formatLabel: string
): Promise<void> {
  const trigger = row.locator('button[aria-haspopup="listbox"]').first();
  const fallbackTrigger = row
    .getByRole("button", { name: /^(webp|png|jpeg|jpg|avif|bmp|ico|pdf|mp4|webm|mov|gif|mkv|avi|mp3|wav|aac|ogg|flac)$/i })
    .first();
  const activeTrigger = (await trigger.count()) > 0 ? trigger : fallbackTrigger;
  await activeTrigger.click();
  const option = page
    .getByRole("option", {
      name: new RegExp(`^${formatLabel}\\b`, "i"),
    })
    .or(
      page.getByRole("button", {
        name: new RegExp(`^${formatLabel}\\b`, "i"),
      })
    );
  await option.first().click();
}

export async function openSettingsOnRow(page: Page, row: Locator): Promise<Locator> {
  const settingsBtn = row.getByRole("button", { name: /configure|settings/i });
  await settingsBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

export function copyFileToDir(srcPath: string, targetDir: string, fileName: string): string {
  fs.mkdirSync(targetDir, { recursive: true });
  const dest = path.join(targetDir, fileName);
  fs.copyFileSync(srcPath, dest);
  return dest;
}

export async function downloadAndReadBuffer(
  page: Page,
  trigger: () => Promise<void>
): Promise<{ download: Download; buffer: Buffer; filename: string }> {
  const downloadPromise = page.waitForEvent("download");
  await trigger();
  const download = await downloadPromise;
  const buffer = await readDownloadBuffer(download);
  return {
    download,
    buffer,
    filename: download.suggestedFilename(),
  };
}

export interface ZipInspectionResult {
  paths: string[];
  directories: string[];
  files: Map<string, Buffer>;
  basenames: string[];
  folders: string[];
  isFlat: boolean;
  totalUncompressedBytes: number;
}

export async function inspectZipEntries(buf: Buffer): Promise<ZipInspectionResult> {
  const zip = await JSZip.loadAsync(buf);
  const directories: string[] = [];
  const files = new Map<string, Buffer>();
  let totalUncompressedBytes = 0;

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      directories.push(name);
    } else {
      const content = await entry.async("nodebuffer");
      files.set(name, content);
      totalUncompressedBytes += content.byteLength;
    }
  }

  directories.sort((a, b) => a.localeCompare(b));
  const paths = Array.from(files.keys()).sort((a, b) => a.localeCompare(b));
  const basenames = paths.map((p) => path.posix.basename(p));
  const folders = Array.from(
    new Set(
      paths.map((p) => {
        const idx = p.lastIndexOf("/");
        return idx === -1 ? "" : p.slice(0, idx);
      })
    )
  ).sort((a, b) => a.localeCompare(b));
  const isFlat =
    paths.length > 0 && paths.every((p) => !p.includes("/")) && directories.length === 0;

  return {
    paths,
    directories,
    files,
    basenames,
    folders,
    isFlat,
    totalUncompressedBytes,
  };
}

export interface JpegExifInspection {
  hasApp1Exif: boolean;
  hasApp1Xmp: boolean;
  hasApp13Iptc: boolean;
  hasCom: boolean;
  hasGps: boolean;
  orientation: number | undefined;
  make: string | undefined;
  model: string | undefined;
  software: string | undefined;
  dateTimeOriginal: string | undefined;
  exposureTime: number | undefined;
  fNumber: number | undefined;
  iso: number | undefined;
  focalLength: number | undefined;
  gpsLatitude: number | undefined;
  gpsLongitude: number | undefined;
  markers: string[];
  tags: Record<string, string | number>;
}

export function inspectJpegExif(buf: Buffer): JpegExifInspection {
  assertJpegValid(buf);

  let hasApp1Exif = false;
  let hasApp1Xmp = false;
  let hasApp13Iptc = false;
  let hasCom = false;
  let hasGps = false;
  let orientation: number | undefined;
  let make: string | undefined;
  let model: string | undefined;
  let software: string | undefined;
  let dateTimeOriginal: string | undefined;
  let exposureTime: number | undefined;
  let fNumber: number | undefined;
  let iso: number | undefined;
  let focalLength: number | undefined;
  let gpsLatitude: number | undefined;
  let gpsLongitude: number | undefined;
  const markers: string[] = [];
  const tags: Record<string, string | number> = {};

  const parseTiff = (tiffBuf: Buffer) => {
    if (tiffBuf.length < 8) return;
    const endian = tiffBuf.subarray(0, 2).toString("ascii");
    if (endian !== "II" && endian !== "MM") return;
    const le = endian === "II";

    const readU16 = (off: number): number =>
      off + 2 <= tiffBuf.length ? (le ? tiffBuf.readUInt16LE(off) : tiffBuf.readUInt16BE(off)) : 0;
    const readU32 = (off: number): number =>
      off + 4 <= tiffBuf.length ? (le ? tiffBuf.readUInt32LE(off) : tiffBuf.readUInt32BE(off)) : 0;
    const readI32 = (off: number): number =>
      off + 4 <= tiffBuf.length ? (le ? tiffBuf.readInt32LE(off) : tiffBuf.readInt32BE(off)) : 0;

    if (readU16(2) !== 0x002a) return;
    const ifd0Offset = readU32(4);

    const typeSizes: Record<number, number> = {
      1: 1, // BYTE
      2: 1, // ASCII
      3: 2, // SHORT
      4: 4, // LONG
      5: 8, // RATIONAL
      7: 1, // UNDEFINED
      9: 4, // SLONG
      10: 8, // SRATIONAL
    };

    const readEntries = (ifdOffset: number) => {
      const entries: Array<{
        tag: number;
        type: number;
        count: number;
        valOffset: number;
        totalBytes: number;
      }> = [];
      if (ifdOffset < 8 || ifdOffset + 2 > tiffBuf.length) return entries;
      const numEntries = readU16(ifdOffset);
      for (let i = 0; i < numEntries; i++) {
        const entryPos = ifdOffset + 2 + i * 12;
        if (entryPos + 12 > tiffBuf.length) break;
        const tag = readU16(entryPos);
        const type = readU16(entryPos + 2);
        const count = readU32(entryPos + 4);
        const elemSize = typeSizes[type] ?? 0;
        const totalBytes = count * elemSize;
        if (elemSize === 0 || count > 65536) continue;
        const valOffset = totalBytes <= 4 ? entryPos + 8 : readU32(entryPos + 8);
        if (valOffset + totalBytes > tiffBuf.length) continue;
        entries.push({ tag, type, count, valOffset, totalBytes });
      }
      return entries;
    };

    const readAscii = (valOffset: number, count: number): string => {
      const raw = tiffBuf.subarray(valOffset, valOffset + count).toString("ascii");
      const nullIdx = raw.indexOf("\0");
      return (nullIdx >= 0 ? raw.slice(0, nullIdx) : raw).trim();
    };

    const readNumeric = (entry: {
      type: number;
      valOffset: number;
    }): number | undefined => {
      if (entry.type === 1) return tiffBuf[entry.valOffset] ?? 0;
      if (entry.type === 3) return readU16(entry.valOffset);
      if (entry.type === 4) return readU32(entry.valOffset);
      if (entry.type === 9) return readI32(entry.valOffset);
      if (entry.type === 5) {
        const num = readU32(entry.valOffset);
        const den = readU32(entry.valOffset + 4);
        return den !== 0 ? num / den : undefined;
      }
      if (entry.type === 10) {
        const num = readI32(entry.valOffset);
        const den = readI32(entry.valOffset + 4);
        return den !== 0 ? num / den : undefined;
      }
      return undefined;
    };

    const readRationals = (valOffset: number, count: number): number[] => {
      const vals: number[] = [];
      for (let i = 0; i < count; i++) {
        const pos = valOffset + i * 8;
        if (pos + 8 > tiffBuf.length) break;
        const num = readU32(pos);
        const den = readU32(pos + 4);
        vals.push(den !== 0 ? num / den : 0);
      }
      return vals;
    };

    let exifIfdOffset: number | undefined;
    let gpsIfdOffset: number | undefined;

    for (const entry of readEntries(ifd0Offset)) {
      if (entry.tag === 0x010f && entry.type === 2) {
        make = readAscii(entry.valOffset, entry.count);
        tags.Make = make;
      } else if (entry.tag === 0x0110 && entry.type === 2) {
        model = readAscii(entry.valOffset, entry.count);
        tags.Model = model;
      } else if (entry.tag === 0x0112) {
        orientation = readNumeric(entry);
        if (orientation !== undefined) tags.Orientation = orientation;
      } else if (entry.tag === 0x0131 && entry.type === 2) {
        software = readAscii(entry.valOffset, entry.count);
        tags.Software = software;
      } else if (entry.tag === 0x8769) {
        exifIfdOffset = readNumeric(entry);
      } else if (entry.tag === 0x8825) {
        gpsIfdOffset = readNumeric(entry);
      }
    }

    if (exifIfdOffset !== undefined) {
      for (const entry of readEntries(exifIfdOffset)) {
        if (entry.tag === 0x829a) {
          exposureTime = readNumeric(entry);
          if (exposureTime !== undefined) tags.ExposureTime = exposureTime;
        } else if (entry.tag === 0x829d) {
          fNumber = readNumeric(entry);
          if (fNumber !== undefined) tags.FNumber = fNumber;
        } else if (entry.tag === 0x8827) {
          iso = readNumeric(entry);
          if (iso !== undefined) tags.ISOSpeedRatings = iso;
        } else if (entry.tag === 0x9003 && entry.type === 2) {
          dateTimeOriginal = readAscii(entry.valOffset, entry.count);
          tags.DateTimeOriginal = dateTimeOriginal;
        } else if (entry.tag === 0x920a) {
          focalLength = readNumeric(entry);
          if (focalLength !== undefined) tags.FocalLength = focalLength;
        }
      }
    }

    if (gpsIfdOffset !== undefined) {
      const gpsEntries = readEntries(gpsIfdOffset);
      if (gpsEntries.length > 0) {
        hasGps = true;
      }
      let latRef = "N";
      let lonRef = "E";
      let latDms: number[] | undefined;
      let lonDms: number[] | undefined;

      for (const entry of gpsEntries) {
        if (entry.tag === 0x0001 && entry.type === 2) {
          latRef = readAscii(entry.valOffset, entry.count).toUpperCase() || "N";
          tags.GPSLatitudeRef = latRef;
        } else if (entry.tag === 0x0002 && entry.type === 5 && entry.count >= 3) {
          latDms = readRationals(entry.valOffset, 3);
        } else if (entry.tag === 0x0003 && entry.type === 2) {
          lonRef = readAscii(entry.valOffset, entry.count).toUpperCase() || "E";
          tags.GPSLongitudeRef = lonRef;
        } else if (entry.tag === 0x0004 && entry.type === 5 && entry.count >= 3) {
          lonDms = readRationals(entry.valOffset, 3);
        }
      }

      if (latDms && latDms.length >= 3) {
        const d = latDms[0] ?? 0;
        const m = latDms[1] ?? 0;
        const s = latDms[2] ?? 0;
        const dec = (d + m / 60 + s / 3600) * (latRef === "S" ? -1 : 1);
        gpsLatitude = Number(dec.toFixed(6));
        tags.GPSLatitude = gpsLatitude;
      }
      if (lonDms && lonDms.length >= 3) {
        const d = lonDms[0] ?? 0;
        const m = lonDms[1] ?? 0;
        const s = lonDms[2] ?? 0;
        const dec = (d + m / 60 + s / 3600) * (lonRef === "W" ? -1 : 1);
        gpsLongitude = Number(dec.toFixed(6));
        tags.GPSLongitude = gpsLongitude;
      }
    }
  };

  let offset = 2;
  while (offset + 1 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (offset + 1 < buf.length && buf[offset + 1] === 0xff) {
      offset++;
    }
    if (offset + 1 >= buf.length) break;
    const marker = buf[offset + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= buf.length) break;
    const segLen = buf.readUInt16BE(offset + 2);
    if (segLen < 2 || offset + 2 + segLen > buf.length) break;
    const payload = buf.subarray(offset + 4, offset + 2 + segLen);

    if (marker === 0xe1) {
      if (payload.length >= 6 && payload.subarray(0, 6).toString("ascii") === "Exif\0\0") {
        hasApp1Exif = true;
        markers.push("APP1/EXIF");
        parseTiff(payload.subarray(6));
      } else if (payload.subarray(0, 29).toString("ascii").startsWith("http://ns.adobe.com/xap/1.0/")) {
        hasApp1Xmp = true;
        markers.push("APP1/XMP");
      } else {
        markers.push("APP1");
      }
    } else if (marker === 0xed) {
      hasApp13Iptc = true;
      markers.push("APP13/IPTC");
    } else if (marker === 0xfe) {
      hasCom = true;
      markers.push("COM");
    }

    offset += 2 + segLen;
  }

  return {
    hasApp1Exif,
    hasApp1Xmp,
    hasApp13Iptc,
    hasCom,
    hasGps,
    orientation,
    make,
    model,
    software,
    dateTimeOriginal,
    exposureTime,
    fNumber,
    iso,
    focalLength,
    gpsLatitude,
    gpsLongitude,
    markers,
    tags,
  };
}

export interface RgbaPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionDiffResult {
  meanAbsDiffRgb: number;
  meanAbsDiffRgba: number;
  maxChannelDiff: number;
  changedPixelRatio: number;
  pixelCount: number;
}

export interface ImageInspection {
  width: number;
  height: number;
  rgba: Buffer;
  samplePixel: (x: number, y: number) => RgbaPixel;
  regionMeanColor: (rect: PixelRect) => RgbaPixel;
  regionDiff: (
    other: ImageInspection | Buffer,
    rect?: PixelRect,
    options?: { diffThreshold?: number }
  ) => RegionDiffResult;
}

export async function inspectImageBuffer(
  page: Page,
  buf: Buffer,
  mimeType: string
): Promise<ImageInspection> {
  const decoded = await page.evaluate(
    async ({ base64, mime }) => {
      const binStr = atob(base64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mime });
      const bitmap = await createImageBitmap(blob, { imageOrientation: "none" });
      const width = bitmap.width;
      const height = bitmap.height;

      let rgbaData: Uint8ClampedArray;
      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          throw new Error("Could not acquire OffscreenCanvas 2d context");
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        rgbaData = ctx.getImageData(0, 0, width, height).data;
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          throw new Error("Could not acquire Canvas 2d context");
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        rgbaData = ctx.getImageData(0, 0, width, height).data;
      }

      const chunks: string[] = [];
      const chunkSize = 0x8000;
      for (let i = 0; i < rgbaData.length; i += chunkSize) {
        const slice = rgbaData.subarray(i, i + chunkSize);
        chunks.push(String.fromCharCode(...slice));
      }
      return { width, height, rgbaBase64: btoa(chunks.join("")) };
    },
    { base64: buf.toString("base64"), mime: mimeType }
  );

  const { width, height, rgbaBase64 } = decoded;
  const rgba = Buffer.from(rgbaBase64, "base64");

  const samplePixel = (x: number, y: number): RgbaPixel => {
    const cx = Math.max(0, Math.min(width - 1, Math.floor(x)));
    const cy = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const idx = (cy * width + cx) * 4;
    return {
      r: rgba[idx] ?? 0,
      g: rgba[idx + 1] ?? 0,
      b: rgba[idx + 2] ?? 0,
      a: rgba[idx + 3] ?? 0,
    };
  };

  const regionMeanColor = (rect: PixelRect): RgbaPixel => {
    const x0 = Math.max(0, Math.floor(rect.x));
    const y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(width, Math.floor(rect.x + rect.width));
    const y1 = Math.min(height, Math.floor(rect.y + rect.height));
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * width + x) * 4;
        sumR += rgba[idx] ?? 0;
        sumG += rgba[idx + 1] ?? 0;
        sumB += rgba[idx + 2] ?? 0;
        sumA += rgba[idx + 3] ?? 0;
        count++;
      }
    }
    if (count === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: sumR / count,
      g: sumG / count,
      b: sumB / count,
      a: sumA / count,
    };
  };

  const regionDiff = (
    other: ImageInspection | Buffer,
    rect?: PixelRect,
    options?: { diffThreshold?: number }
  ): RegionDiffResult => {
    const otherRgba = Buffer.isBuffer(other) ? other : other.rgba;
    const otherWidth = Buffer.isBuffer(other) ? width : other.width;
    const otherHeight = Buffer.isBuffer(other) ? height : other.height;
    const threshold = options?.diffThreshold ?? 2;

    const maxW = Math.min(width, otherWidth);
    const maxH = Math.min(height, otherHeight);
    const x0 = Math.max(0, Math.floor(rect?.x ?? 0));
    const y0 = Math.max(0, Math.floor(rect?.y ?? 0));
    const x1 = Math.min(maxW, Math.floor(rect ? rect.x + rect.width : maxW));
    const y1 = Math.min(maxH, Math.floor(rect ? rect.y + rect.height : maxH));

    let totalRgbDiff = 0;
    let totalRgbaDiff = 0;
    let maxChannelDiff = 0;
    let changedPixels = 0;
    let pixelCount = 0;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idxA = (y * width + x) * 4;
        const idxB = (y * otherWidth + x) * 4;
        const dr = Math.abs((rgba[idxA] ?? 0) - (otherRgba[idxB] ?? 0));
        const dg = Math.abs((rgba[idxA + 1] ?? 0) - (otherRgba[idxB + 1] ?? 0));
        const db = Math.abs((rgba[idxA + 2] ?? 0) - (otherRgba[idxB + 2] ?? 0));
        const da = Math.abs((rgba[idxA + 3] ?? 0) - (otherRgba[idxB + 3] ?? 0));
        const maxCh = Math.max(dr, dg, db, da);

        totalRgbDiff += (dr + dg + db) / 3;
        totalRgbaDiff += (dr + dg + db + da) / 4;
        if (maxCh > maxChannelDiff) maxChannelDiff = maxCh;
        if (Math.max(dr, dg, db) > threshold) changedPixels++;
        pixelCount++;
      }
    }

    if (pixelCount === 0) {
      return {
        meanAbsDiffRgb: 0,
        meanAbsDiffRgba: 0,
        maxChannelDiff: 0,
        changedPixelRatio: 0,
        pixelCount: 0,
      };
    }

    return {
      meanAbsDiffRgb: totalRgbDiff / pixelCount,
      meanAbsDiffRgba: totalRgbaDiff / pixelCount,
      maxChannelDiff,
      changedPixelRatio: changedPixels / pixelCount,
      pixelCount,
    };
  };

  return {
    width,
    height,
    rgba,
    samplePixel,
    regionMeanColor,
    regionDiff,
  };
}

export const inspectImagePixelsAndDimensions = inspectImageBuffer;

export interface PdfPageInfo {
  pageNumber: number;
  width: number;
  height: number;
  rotationAngle: number;
}

export interface PdfInspectionResult {
  pageCount: number;
  pages: PdfPageInfo[];
  title: string | undefined;
}

export async function inspectPdfBuffer(buf: Buffer): Promise<PdfInspectionResult> {
  expect(buf.length).toBeGreaterThan(20);
  expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const doc = await PDFDocument.load(buf);
  const pages = doc.getPages().map((page, idx) => {
    const { width, height } = page.getSize();
    const rawAngle = page.getRotation().angle;
    const rotationAngle = ((rawAngle % 360) + 360) % 360;
    return {
      pageNumber: idx + 1,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      rotationAngle,
    };
  });

  return {
    pageCount: pages.length,
    pages,
    title: doc.getTitle(),
  };
}

export async function inspectAudioDuration(
  page: Page,
  buf: Buffer,
  mimeType?: string
): Promise<number> {
  const mime = mimeType ?? "audio/mpeg";
  const base64 = buf.toString("base64");

  return page.evaluate(
    async ({ b64, mediaMime, byteLen }) => {
      const binStr = atob(b64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }

      try {
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const audioBuf = await ctx.decodeAudioData(bytes.buffer.slice(0));
        if (Number.isFinite(audioBuf.duration) && audioBuf.duration > 0) {
          return audioBuf.duration;
        }
      } catch {
        // Fall back to HTMLAudioElement with data URL
      }

      return new Promise<number>((resolve, reject) => {
        const audio = document.createElement("audio");
        let settled = false;
        const cleanup = () => {
          audio.removeAttribute("src");
          audio.load();
        };
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(
            new Error(
              `Timed out reading audio duration via <audio> (mime=${mediaMime}, bytes=${byteLen})`
            )
          );
        }, 10000);

        audio.addEventListener("loadedmetadata", () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          const dur = audio.duration;
          cleanup();
          if (Number.isFinite(dur) && dur > 0) {
            resolve(dur);
          } else {
            reject(
              new Error(`Invalid <audio> duration=${dur} (mime=${mediaMime}, bytes=${byteLen})`)
            );
          }
        });

        audio.addEventListener("error", () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          cleanup();
          reject(
            new Error(
              `Failed to decode audio via WebAudio or <audio> (mime=${mediaMime}, bytes=${byteLen})`
            )
          );
        });

        audio.preload = "metadata";
        audio.src = `data:${mediaMime};base64,${b64}`;
      });
    },
    { b64: base64, mediaMime: mime, byteLen: buf.byteLength }
  );
}

export interface GifInspectionResult {
  version: string;
  width: number;
  height: number;
  frameCount: number;
  hasNetscapeExt: boolean;
  loopCount: number | null;
  frameDelaysCs: number[];
  avgDelayMs: number;
  estimatedFps: number | null;
}

export function inspectGifBinary(buf: Buffer): GifInspectionResult {
  if (buf.length < 13) {
    throw new Error(`Invalid GIF buffer: length ${buf.length} < 13`);
  }
  const header = buf.subarray(0, 6).toString("ascii");
  if (header !== "GIF87a" && header !== "GIF89a") {
    throw new Error(`Invalid GIF signature: ${header}`);
  }

  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  const packed = buf[10] ?? 0;

  let offset = 13;
  if ((packed & 0x80) !== 0) {
    const gctColors = 1 << ((packed & 0x07) + 1);
    offset += 3 * gctColors;
  }

  const skipSubBlocks = () => {
    while (offset < buf.length) {
      const blockLen = buf[offset++] ?? 0;
      if (blockLen === 0) break;
      offset += blockLen;
    }
  };

  let frameCount = 0;
  let hasNetscapeExt = false;
  let loopCount: number | null = null;
  const frameDelaysCs: number[] = [];
  let pendingDelayCs: number | null = null;

  while (offset < buf.length) {
    const introducer = buf[offset++] ?? 0;
    if (introducer === 0x3b) {
      break;
    }
    if (introducer === 0x00) {
      continue;
    }
    if (introducer === 0x2c) {
      if (offset + 9 > buf.length) break;
      const imgPacked = buf[offset + 8] ?? 0;
      offset += 9;
      if ((imgPacked & 0x80) !== 0) {
        const lctColors = 1 << ((imgPacked & 0x07) + 1);
        offset += 3 * lctColors;
      }
      if (offset < buf.length) {
        offset++; // LZW minimum code size
      }
      skipSubBlocks();
      frameCount++;
      frameDelaysCs.push(pendingDelayCs ?? 0);
      pendingDelayCs = null;
    } else if (introducer === 0x21) {
      if (offset >= buf.length) break;
      const label = buf[offset++] ?? 0;
      if (label === 0xf9) {
        // Graphic Control Extension
        const blockSize = buf[offset++] ?? 0;
        if (blockSize >= 4 && offset + blockSize <= buf.length) {
          pendingDelayCs = buf.readUInt16LE(offset + 1);
        }
        offset += blockSize;
        skipSubBlocks();
      } else if (label === 0xff) {
        // Application Extension
        const blockSize = buf[offset++] ?? 0;
        const appId =
          offset + blockSize <= buf.length
            ? buf.subarray(offset, offset + blockSize).toString("ascii")
            : "";
        offset += blockSize;
        const dataChunks: Buffer[] = [];
        while (offset < buf.length) {
          const subLen = buf[offset++] ?? 0;
          if (subLen === 0) break;
          const end = Math.min(buf.length, offset + subLen);
          dataChunks.push(buf.subarray(offset, end));
          offset = end;
        }
        if (appId === "NETSCAPE2.0" || appId === "ANIMEXTS1.0") {
          hasNetscapeExt = true;
          const appData = Buffer.concat(dataChunks);
          if (appData.length >= 3 && appData[0] === 0x01) {
            loopCount = appData.readUInt16LE(1);
          }
        }
      } else if (label === 0xfe) {
        // Comment Extension has sub-blocks directly (no fixed header byte)
        skipSubBlocks();
      } else {
        // Plain Text (0x01) or unknown extension
        const blockSize = buf[offset++] ?? 0;
        offset += blockSize;
        skipSubBlocks();
      }
    } else {
      break;
    }
  }

  const totalDelayCs = frameDelaysCs.reduce((sum, d) => sum + d, 0);
  const avgDelayMs =
    frameDelaysCs.length > 0 ? (totalDelayCs / frameDelaysCs.length) * 10 : 0;
  const estimatedFps = avgDelayMs > 0 ? Number((1000 / avgDelayMs).toFixed(2)) : null;

  return {
    version: header,
    width,
    height,
    frameCount,
    hasNetscapeExt,
    loopCount,
    frameDelaysCs,
    avgDelayMs,
    estimatedFps,
  };
}

interface SerializedDropFile {
  name: string;
  fullPath: string;
  mimeType: string;
  base64: string;
}

interface SerializedDropDir {
  name: string;
  fullPath: string;
  files: SerializedDropFile[];
  dirs: SerializedDropDir[];
}

function guessMimeFromName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".pdf":
      return "application/pdf";
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".webm":
      return "video/webm";
    case ".mp4":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}

function serializeDropDir(currentDir: string, virtualPath: string): SerializedDropDir {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const files: SerializedDropFile[] = [];
  const dirs: SerializedDropDir[] = [];

  for (const entry of entries) {
    const abs = path.join(currentDir, entry.name);
    const childVirtualPath = `${virtualPath}/${entry.name}`;
    if (entry.isDirectory()) {
      dirs.push(serializeDropDir(abs, childVirtualPath));
    } else if (entry.isFile()) {
      const buf = fs.readFileSync(abs);
      files.push({
        name: entry.name,
        fullPath: childVirtualPath,
        mimeType: guessMimeFromName(entry.name),
        base64: buf.toString("base64"),
      });
    }
  }

  return {
    name: path.basename(currentDir),
    fullPath: virtualPath,
    files,
    dirs,
  };
}

export async function dispatchFolderDrop(
  page: Page,
  dirPath: string,
  targetLocator?: Locator
): Promise<void> {
  const rootName = path.basename(dirPath);
  const tree = serializeDropDir(dirPath, `/${rootName}`);

  const target =
    targetLocator ??
    page
      .getByRole("button", { name: /drop files here or press enter|drop more files/i })
      .first();

  await expect(target).toBeVisible();

  await target.evaluate((el, serializedTree) => {
    interface SimEntry {
      isFile: boolean;
      isDirectory: boolean;
      name: string;
      fullPath: string;
      file?: (cb: (f: File) => void) => void;
      createReader?: () => { readEntries: (cb: (entries: SimEntry[]) => void) => void };
    }

    const decodeFile = (spec: SerializedDropFile): File => {
      const bin = atob(spec.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return new File([bytes], spec.name, { type: spec.mimeType });
    };

    const buildEntry = (dirSpec: SerializedDropDir): SimEntry => {
      const children: SimEntry[] = [
        ...dirSpec.files.map((f): SimEntry => {
          const fileObj = decodeFile(f);
          return {
            isFile: true,
            isDirectory: false,
            name: f.name,
            fullPath: f.fullPath,
            file: (cb) => cb(fileObj),
          };
        }),
        ...dirSpec.dirs.map((d) => buildEntry(d)),
      ];

      return {
        isFile: false,
        isDirectory: true,
        name: dirSpec.name,
        fullPath: dirSpec.fullPath,
        createReader: () => {
          let cursor = 0;
          return {
            readEntries: (cb) => {
              if (cursor >= children.length) {
                cb([]);
                return;
              }
              const batch = children.slice(cursor, cursor + 100);
              cursor += batch.length;
              cb(batch);
            },
          };
        },
      };
    };

    const rootEntry = buildEntry(serializedTree);
    const dtItems = [
      {
        kind: "file",
        type: "",
        getAsFile: () => null,
        webkitGetAsEntry: () => rootEntry,
      },
    ];

    const dataTransfer = {
      dropEffect: "copy",
      effectAllowed: "all",
      files: [] as unknown as FileList,
      types: ["Files"],
      items: dtItems,
    };

    const dragOverEvt = new DragEvent("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvt, "dataTransfer", { value: dataTransfer });
    el.dispatchEvent(dragOverEvt);

    const dropEvt = new DragEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvt, "dataTransfer", { value: dataTransfer });
    el.dispatchEvent(dropEvt);
  }, tree);
}
