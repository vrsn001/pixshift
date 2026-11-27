import { expect, test } from "@playwright/test";
import {
  assertBmpBuffer,
  assertIcoBuffer,
  assertPdfBuffer,
  assertWebpBuffer,
  attachRuntimeMonitor,
  getBlobSpyState,
  getFixtures,
  installBlobUrlSpy,
  queueRow,
  readBmpPixel,
  readDownloadBuffer,
  selectFormatOnRow,
  uploadFiles,
} from "./helpers";

test.describe("Phase 1 conversions, COEP self-hosting, and lifecycle", () => {
  test("self-hosted WASM & PDF worker make zero unpkg.com requests", async ({ page }) => {
    test.setTimeout(60_000);
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, [fixtures.sample2PagePdf, fixtures.sampleWav]);

    const pdfRow = queueRow(page, "sample-2page.pdf");
    const wavRow = queueRow(page, "sample.wav");
    await expect(pdfRow).toBeVisible();
    await expect(wavRow).toBeVisible();

    await page.getByRole("button", { name: /convert all/i }).click();

    await expect(pdfRow.getByText("Done")).toBeVisible({ timeout: 30_000 });
    await expect(wavRow.getByText("Done")).toBeVisible({ timeout: 60_000 });

    monitor.assertZeroUnpkg();
    monitor.assertClean();
  });

  test("single image -> PDF outputs genuine %PDF- bytes and mergeToPdf resets cleanly", async ({
    page,
  }) => {
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    // Upload 2 PNGs, target PDF on both, toggle Merge, then remove 1
    await uploadFiles(page, [fixtures.samplePng, fixtures.transparentLargePng]);

    const row1 = queueRow(page, "sample.png");
    const row2 = queueRow(page, "transparent-large.png");

    await selectFormatOnRow(page, row1, "PDF");
    await selectFormatOnRow(page, row2, "PDF");

    const mergeToggle = page.getByLabel(/merge images to single pdf/i);
    await expect(mergeToggle).toBeVisible();
    await mergeToggle.check();
    await expect(mergeToggle).toBeChecked();

    // Remove second file -> merge toggle must reset/hide automatically
    await row2.getByRole("button", { name: /remove/i }).click();
    await expect(row2).toBeHidden();
    await expect(mergeToggle).toBeHidden();

    // Remaining single image must still convert to a real 1-page PDF
    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(row1.getByText("Done")).toBeVisible({ timeout: 20_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      row1.getByRole("button", { name: /download/i }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("sample.pdf");
    const pdfBuf = await readDownloadBuffer(download);
    await assertPdfBuffer(pdfBuf, 1);

    monitor.assertClean();
  });

  test("document targets exclude PDF; BMP and ICO produce valid headers", async ({ page }) => {
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, [fixtures.sample2PagePdf, fixtures.transparentLargePng]);

    // Check document target dropdown contains only PNG and JPEG
    const docRow = queueRow(page, "sample-2page.pdf");
    await docRow.locator('button[aria-haspopup="listbox"]').click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    const optionTexts = await listbox.getByRole("option").allInnerTexts();
    expect(optionTexts.some((t) => /\bPDF\b/i.test(t))).toBe(false);
    expect(optionTexts.some((t) => /\bPNG\b/i.test(t))).toBe(true);
    expect(optionTexts.some((t) => /\bJPEG\b/i.test(t))).toBe(true);
    await page.keyboard.press("Escape");

    // Convert 512x384 transparent PNG -> BMP
    const imgRow = queueRow(page, "transparent-large.png");
    await selectFormatOnRow(page, imgRow, "BMP");
    // Remove pdf so Convert All only processes image here
    await docRow.getByRole("button", { name: /remove/i }).click();

    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(imgRow.getByText("Done")).toBeVisible({ timeout: 20_000 });

    const [bmpDownload] = await Promise.all([
      page.waitForEvent("download"),
      imgRow.getByRole("button", { name: /download/i }).click(),
    ]);
    const bmpBuf = await readDownloadBuffer(bmpDownload);
    assertBmpBuffer(bmpBuf, 512, 384);
    expect(readBmpPixel(bmpBuf, 0, 0)).toEqual({ r: 255, g: 255, b: 255 });

    // Re-target same image -> ICO (must cap proportionally to 256x192)
    await selectFormatOnRow(page, imgRow, "ICO");
    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(imgRow.getByText("Done")).toBeVisible({ timeout: 20_000 });

    const [icoDownload] = await Promise.all([
      page.waitForEvent("download"),
      imgRow.getByRole("button", { name: /download/i }).click(),
    ]);
    const icoBuf = await readDownloadBuffer(icoDownload);
    assertIcoBuffer(icoBuf, 256, 192);

    monitor.assertClean();
  });

  test("rejects unknown files with role=alert and revokes output blob URLs on removal", async ({
    page,
  }) => {
    const monitor = attachRuntimeMonitor(page);
    await installBlobUrlSpy(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    // Unsupported .xyz must show [role="alert"] and zero queue rows
    await uploadFiles(page, fixtures.unknownXyz);
    const alert = page.getByRole("alert").filter({ hasText: /unsupported file/i });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("unknown.xyz");
    await expect(page.getByRole("button", { name: /convert all/i })).toBeHidden();

    // Valid conversion -> remove revokes output blob URL
    await uploadFiles(page, fixtures.samplePng);
    const row = queueRow(page, "sample.png");
    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(row.getByText("Done")).toBeVisible({ timeout: 20_000 });

    const [webpDownload] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("button", { name: /download/i }).click(),
    ]);
    assertWebpBuffer(await readDownloadBuffer(webpDownload));

    const spyBeforeRemove = await getBlobSpyState(page);
    const outputBlobUrls = spyBeforeRemove.created
      .filter((entry) => entry.type === "image/webp")
      .map((entry) => entry.url);
    expect(outputBlobUrls.length).toBeGreaterThanOrEqual(1);

    await row.getByRole("button", { name: /remove/i }).click();

    const spyAfterRemove = await getBlobSpyState(page);
    for (const url of outputBlobUrls) {
      expect(spyAfterRemove.revoked).toContain(url);
    }

    monitor.assertClean();
  });
});
