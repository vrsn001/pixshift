import { expect, test } from "@playwright/test";
import {
  assertJpegStripped,
  attachRuntimeMonitor,
  dispatchFolderDrop,
  downloadAndReadBuffer,
  getFixtures,
  inspectGifBinary,
  inspectJpegExif,
  inspectPdfBuffer,
  inspectZipEntries,
  openSettingsOnRow,
  queueRow,
  readDownloadBuffer,
  selectFormatOnRow,
  uploadFiles,
} from "./helpers";

test.describe("Pixshift v3 — Batch 200, Pro Studios, OCR, PWA & E2EE Share", () => {
  test("handles 200-image nested folder with Mass Bar, folder filter, rename, virtual DOM, and preserve/flatten ZIP", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await dispatchFolderDrop(page, fixtures.batch200Dir);

    const massBar = page.getByTestId("mass-control-bar");
    await expect(massBar).toBeVisible({ timeout: 15_000 });
    await expect(massBar).toContainText("200/200");

    // Windowed virtual queue MUST bound DOM nodes cleanly below 60 even with 200 files
    await expect(page.getByTestId("virtual-queue-viewport")).toBeVisible();
    const domRowCount = await page.locator('[data-queue-row="true"]').count();
    expect(domRowCount).toBeLessThan(60);

    // Filter by nested folder pill
    await massBar.getByRole("button", { name: /events\/day1/i }).click();
    await expect(massBar).toContainText("49/200");
    await massBar.getByRole("button", { name: /^All \(200\)/i }).click();
    await expect(massBar).toContainText("200/200");

    // Mass format conversion -> WEBP + Batch Rename pattern
    await massBar.getByRole("button", { name: /^webp$/i }).click();
    await massBar.getByRole("button", { name: /batch rename/i }).click();
    await massBar.getByLabel(/pattern tokens/i).fill("{folder}_{name}_{index:3}");

    // Convert all 200 images and check live telemetry + completion
    await page.getByRole("button", { name: /convert all \(200\)/i }).click();
    await expect(page.getByRole("button", { name: /download all \(200 \.zip/i })).toBeVisible({
      timeout: 70_000,
    });

    const telemetry = page.getByTestId("batch-savings-telemetry");
    await expect(telemetry).toBeVisible();
    await expect(telemetry).toContainText(/\/200/);
    await expect(telemetry).toContainText("files/s");

    // 1. Preserve nested folder structure in .zip
    const preserved = await downloadAndReadBuffer(page, async () => {
      await page.getByRole("button", { name: /download all \(200 \.zip/i }).click();
    });
    const preservedZip = await inspectZipEntries(preserved.buffer);
    expect(preservedZip.paths.length).toBe(200);
    expect(preservedZip.isFlat).toBe(false);
    expect(preservedZip.paths.some((p) => p.startsWith("batch-200/events/day1/"))).toBe(true);
    expect(preservedZip.basenames.some((b) => /batch-200_events_day1/.test(b))).toBe(true);

    // 2. Flatten outputs to archive root
    await massBar.getByRole("button", { name: /flatten root/i }).click();
    const flattened = await downloadAndReadBuffer(page, async () => {
      await page.getByRole("button", { name: /download all \(200 \.zip/i }).click();
    });
    const flattenedZip = await inspectZipEntries(flattened.buffer);
    expect(flattenedZip.paths.length).toBe(200);
    expect(flattenedZip.isFlat).toBe(true);

    monitor.assertZeroExternalUploads();
    monitor.assertClean();
  });

  test("applies Target-KB compression, rotate +90deg, watermark, and strips rich EXIF", async ({
    page,
  }) => {
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, fixtures.richExifJpg);
    const row = queueRow(page, "rich-exif.jpg");
    await expect(row).toBeVisible();
    await selectFormatOnRow(page, row, "JPEG");

    const dialog = await openSettingsOnRow(page, row);
    await expect(dialog.getByTestId("smart-compression-preview")).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "+90°" }).click();
    await dialog.getByLabel("Watermark text").fill("PIXSHIFT");
    await dialog.getByRole("button", { name: "100 KB" }).click();
    await dialog.getByRole("button", { name: /save settings/i }).click();

    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(row.getByText("Done")).toBeVisible({ timeout: 20_000 });

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("button", { name: /download/i }).click(),
    ]);
    const buf = await readDownloadBuffer(dl);
    expect(buf.byteLength).toBeLessThanOrEqual(100 * 1024);
    assertJpegStripped(buf);
    const meta = inspectJpegExif(buf);
    expect(meta.hasGps).toBe(false);

    monitor.assertZeroExternalUploads();
    monitor.assertClean();
  });

  test("Video-to-GIF Studio renders custom FPS, loop count, and reverse GIF via FFmpeg WASM", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, fixtures.sampleLongWebm);
    const row = queueRow(page, "sample-long.webm");
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: /gif studio/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "10", exact: true }).click();
    await dialog.getByLabel(/loop count/i).fill("2");
    await dialog.getByRole("button", { name: /reverse gif/i }).click();
    await dialog.getByRole("button", { name: /render preview gif/i }).click();

    await expect(dialog.getByRole("button", { name: /save to queue/i })).toBeVisible({
      timeout: 45_000,
    });
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: /download gif/i }).click(),
    ]);
    const gifInfo = inspectGifBinary(await readDownloadBuffer(dl));
    expect(["GIF87a", "GIF89a"]).toContain(gifInfo.version);
    expect(gifInfo.frameCount).toBeGreaterThanOrEqual(2);
    expect(gifInfo.loopCount).toBe(2);

    monitor.assertZeroUnpkg();
    monitor.assertZeroExternalUploads();
    monitor.assertClean();
  });

  test("PDF Page Studio splits ranges into multi-PDF ZIP with verified page counts", async ({
    page,
  }) => {
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, fixtures.sample4PagePdf);
    const row = queueRow(page, "sample-4page.pdf");
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: /page studio/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("4 of 4 pages selected")).toBeVisible({ timeout: 15_000 });

    await dialog.getByLabel(/split by page ranges/i).fill("1-2, 3-4");
    await dialog.getByRole("button", { name: /split ranges/i }).click();
    await expect(dialog).toBeHidden();
    await expect(row.getByText("Done")).toBeVisible();

    const zipDl = await downloadAndReadBuffer(page, async () => {
      await page.getByRole("button", { name: /download all/i }).click();
    });
    const entries = await inspectZipEntries(zipDl.buffer);
    expect(entries.paths.length).toBe(2);
    for (const partBuf of entries.files.values()) {
      const info = await inspectPdfBuffer(partBuf);
      expect(info.pageCount).toBe(2);
    }

    monitor.assertZeroUnpkg();
    monitor.assertZeroExternalUploads();
    monitor.assertClean();
  });

  test("self-hosted OCR extracts crisp text completely offline without CDN calls", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const monitor = attachRuntimeMonitor(page);
    await page.goto("/");

    // Render crisp synthetic text PNG directly inside browser
    const dropBtn = page.getByRole("button", { name: /drop files here or press enter/i });
    await dropBtn.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 140;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 44px monospace";
      ctx.fillText("PIXSHIFT 2026", 32, 84);

      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
      const file = new File([blob], "ocr-card.png", { type: "image/png" });
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Select files"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      Object.defineProperty(input, "files", { value: dt.files, configurable: true });
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const row = queueRow(page, "ocr-card.png");
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /extract ocr text/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 45_000 });
    const textValue = await dialog.getByLabel(/extracted ocr text/i).inputValue();
    expect(textValue.toUpperCase()).toContain("PIXSHIFT");

    monitor.assertZeroExternalUploads();
    monitor.assertClean();
  });

  test("serves isolated PWA SW/manifest and completes E2EE share round-trip without exposing key", async ({
    page,
    request,
  }) => {
    const swRes = await request.get("/sw.js");
    expect(swRes.status()).toBe(200);
    const manifestRes = await request.get("/manifest.webmanifest");
    expect(manifestRes.status()).toBe(200);
    const manifestJson = (await manifestRes.json()) as Record<string, unknown>;
    expect(manifestJson.file_handlers).toBeDefined();
    expect(manifestJson.share_target).toBeDefined();

    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, fixtures.samplePng);
    const row = queueRow(page, "sample.png");
    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(row.getByText("Done")).toBeVisible({ timeout: 15_000 });

    await row.getByRole("button", { name: /share sample\.png/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /encrypt & generate share link/i }).click();
    await expect(dialog.getByTestId("encrypted-share-result")).toBeVisible({ timeout: 15_000 });

    const shareUrl = await dialog.getByLabel("Encrypted share URL").inputValue();
    expect(shareUrl).toContain("#k=");
    const keyFrag = shareUrl.split("#k=")[1] ?? "";
    expect(keyFrag.length).toBeGreaterThan(20);

    // Ensure key fragment was NEVER sent over HTTP
    for (const req of monitor.requests) {
      expect(req.url).not.toContain(keyFrag);
    }

    await page.goto(shareUrl);
    const readyCard = page.getByTestId("decrypted-share-ready");
    await expect(readyCard).toBeVisible({ timeout: 15_000 });
    await expect(readyCard).toContainText("sample.webp");

    monitor.assertClean();
  });
});
