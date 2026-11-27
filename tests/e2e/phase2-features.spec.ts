import { expect, test } from "@playwright/test";
import {
  assertJpegStripped,
  assertMp4OrWebmBuffer,
  attachRuntimeMonitor,
  getFixtures,
  openSettingsOnRow,
  parsePngDimensions,
  queueRow,
  readDownloadBuffer,
  selectFormatOnRow,
  uploadFiles,
  uploadFolder,
} from "./helpers";

const LEGACY_PRESET_LABELS = [
  "Original",
  "320×240",
  "480p",
  "640×480",
  "720p",
  "800×600",
  "1080p",
  "1440p",
  "2048p",
  "4K UHD",
];

test.describe("Phase 2 instrument features", () => {
  test("Visual Diff Slider, NumberFlow savings telemetry, and thumbnails", async ({ page }) => {
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, fixtures.transparentLargePng);
    const row = queueRow(page, "transparent-large.png");
    await expect(row).toBeVisible();

    // Queue thumbnail <img> must decode cleanly
    const thumb = row.locator("img").first();
    await expect(thumb).toBeVisible();
    await expect.poll(async () => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(row.getByText("Done")).toBeVisible({ timeout: 20_000 });

    // Batch NumberFlow telemetry and row byte savings must render
    const telemetry = page.getByTestId("batch-savings-telemetry");
    await expect(telemetry).toBeVisible();
    await expect(telemetry).toContainText(/Saved|Delta/);
    await expect(telemetry).toContainText("%");

    // Open Visual Diff Slider modal
    await row.getByRole("button", { name: /compare/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const slider = dialog.getByRole("slider", { name: /comparison split position/i });
    await expect(slider).toHaveAttribute("aria-valuenow", "50");

    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "51");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "61");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    monitor.assertClean();
  });

  test("EXIF scanner detects and strips APP1 metadata cleanly", async ({ page }) => {
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, fixtures.photoExifJpg);
    const row = queueRow(page, "photo-exif.jpg");
    await expect(row).toBeVisible();
    await expect(row.getByText("EXIF", { exact: true })).toBeVisible();

    await selectFormatOnRow(page, row, "JPEG");
    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(row.getByText("Done")).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText("STRIPPED", { exact: true })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("button", { name: /download/i }).click(),
    ]);
    const buf = await readDownloadBuffer(download);
    assertJpegStripped(buf);

    monitor.assertClean();
  });

  test("SettingsModal exposes 10 legacy presets and proportional custom WxH", async ({ page }) => {
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, fixtures.transparentLargePng);
    const row = queueRow(page, "transparent-large.png");
    await selectFormatOnRow(page, row, "PNG");

    const dialog = await openSettingsOnRow(page, row);

    for (const label of LEGACY_PRESET_LABELS) {
      await expect(dialog.getByRole("button", { name: new RegExp(label) })).toBeVisible();
    }

    // transparent-large.png is 512x384 (4:3); filling Width=200 must auto-calc Height=150
    const widthInput = dialog.getByLabel(/width \(px\)/i);
    const heightInput = dialog.getByLabel(/height \(px\)/i);
    await widthInput.fill("200");
    await expect(heightInput).toHaveValue("150");

    await dialog.getByRole("button", { name: /save settings/i }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(row.getByText("Done")).toBeVisible({ timeout: 20_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("button", { name: /download/i }).click(),
    ]);
    const pngDims = parsePngDimensions(await readDownloadBuffer(download));
    expect(pngDims).toEqual({ width: 200, height: 150 });

    monitor.assertClean();
  });

  test("Video trim, compression presets, and engine capability badge work cleanly", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, fixtures.sampleWebm);
    const row = queueRow(page, "sample.webm");
    await expect(row).toBeVisible();

    const dialog = await openSettingsOnRow(page, row);
    const badge = dialog.getByTestId("video-engine-badge");
    await expect(badge).toBeVisible();
    const badgeText = await badge.innerText();
    expect(["WEBCODECS HW", "FFMPEG WASM"]).toContain(badgeText.trim());

    await dialog.getByRole("button", { name: /compact/i }).click();
    await dialog.getByLabel(/trim start/i).fill("0.1");
    await dialog.getByLabel(/trim end/i).fill("0.6");

    await dialog.getByRole("button", { name: /save settings/i }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: /convert all/i }).click();
    await expect(row.getByText("Done")).toBeVisible({ timeout: 50_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      row.getByRole("button", { name: /download/i }).click(),
    ]);
    assertMp4OrWebmBuffer(await readDownloadBuffer(download));

    monitor.assertZeroUnpkg();
    monitor.assertClean();
  });

  test("webkitdirectory folder upload skips dotfiles and zero-byte files", async ({ page }) => {
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFolder(page, fixtures.folderDropDir);

    await expect(queueRow(page, "nested.png")).toBeVisible();
    await expect(page.getByText(".DS_Store")).toBeHidden();
    await expect(page.getByText("empty.png")).toBeHidden();

    monitor.assertClean();
  });
});
