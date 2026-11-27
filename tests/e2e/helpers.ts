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

export interface RuntimeMonitor {
  pageErrors: string[];
  consoleErrors: string[];
  requestUrls: string[];
  assertClean: (options?: { allowConsolePatterns?: RegExp[] }) => void;
  assertZeroUnpkg: () => void;
}

export function attachRuntimeMonitor(page: Page): RuntimeMonitor {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const requestUrls: string[] = [];

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("request", (req) => {
    requestUrls.push(req.url());
  });

  return {
    pageErrors,
    consoleErrors,
    requestUrls,
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
  };
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
  const fileInput = page.locator('input[type="file"]:not([webkitdirectory])');
  await fileInput.setInputFiles(filePaths);
}

export async function uploadFolder(page: Page, dirPath: string): Promise<void> {
  const folderInput = page.locator('input[type="file"][webkitdirectory]');
  await folderInput.setInputFiles(dirPath);
}

export function queueRow(page: Page, fileName: string): Locator {
  return page
    .locator("div")
    .filter({ has: page.getByText(fileName, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: /remove/i }) })
    .last();
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
  const option = page.getByRole("button", {
    name: new RegExp(`^${formatLabel}\\b`, "i"),
  });
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
