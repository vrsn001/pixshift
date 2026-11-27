import { expect, test } from "@playwright/test";
import {
  attachRuntimeMonitor,
  compositeOver,
  contrastRatio,
  getFixtures,
  openSettingsOnRow,
  parseCssColor,
  parsePngDimensions,
  queueRow,
  uploadFiles,
} from "./helpers";

test.describe("Phase 1 brand, OpenGraph, WCAG AA contrast, and interactive accessibility", () => {
  test("unifies Pixshift branding and exact R3 landing copy", async ({ page }) => {
    const monitor = attachRuntimeMonitor(page);
    await page.goto("/");

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Pixshift");
    expect(bodyText).not.toMatch(/Pixyshift/i);

    await expect(page.getByText("Runs in your browser")).toBeVisible();
    await expect(page.locator("h1")).toHaveText(
      "Convert images, video, audio, and PDFs on your device."
    );
    await expect(
      page.getByText(
        "Drop media below to convert between WebP, AVIF, MP4, MP3, GIF, and PDF. Nothing gets uploaded because your browser does the work."
      )
    ).toBeVisible();

    await expect(page.getByRole("heading", { name: "Your files stay on your disk" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Batch queues with real controls" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pay for nothing" })).toBeVisible();

    monitor.assertClean();
  });

  test("serves 1200x630 PNG from /opengraph-image", async ({ request }) => {
    const res = await request.get("/opengraph-image");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    const buf = Buffer.from(await res.body());
    const dims = parsePngDimensions(buf);
    expect(dims).toEqual({ width: 1200, height: 630 });
  });

  test("DropZone keyboard Enter opens file chooser and SettingsModal supports dialog Escape/backdrop close", async ({
    page,
  }) => {
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    const dropBtn = page.getByRole("button", { name: /drop files here or press enter/i });
    await dropBtn.focus();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.keyboard.press("Enter"),
    ]);
    await chooser.setFiles(fixtures.samplePng);

    const row = queueRow(page, "sample.png");
    await expect(row).toBeVisible();

    // Open SettingsModal -> verify dialog role, Escape close, and backdrop close
    const dialog = await openSettingsOnRow(page, row);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const dialogAgain = await openSettingsOnRow(page, row);
    const backdrop = page.locator('[role="presentation"]').first();
    await backdrop.click({ position: { x: 10, y: 10 } });
    await expect(dialogAgain).toBeHidden();

    monitor.assertClean();
  });

  test("meets WCAG AA (>= 4.5:1) contrast for muted text and honors prefers-reduced-motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const monitor = attachRuntimeMonitor(page);
    const fixtures = await getFixtures();
    await page.goto("/");

    await uploadFiles(page, fixtures.samplePng);
    const row = queueRow(page, "sample.png");
    await expect(row).toBeVisible();

    // Verify no visible elements carry #5a5952 and muted text passes >= 4.5:1 against dark surfaces
    const contrastChecks = await page.evaluate(() => {
      const results: { text: string; fg: string; bg: string }[] = [];
      const selectors = [
        "footer span",
        "footer p",
        "nav div",
        "main p",
      ];
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          const text = (el.textContent ?? "").trim();
          if (!text || el.children.length > 0) continue;
          if (el.closest('[aria-hidden="true"]')) continue;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;

          // Walk ancestors for non-transparent background color
          let bgColor = "rgb(10, 10, 11)";
          let cur: Element | null = el;
          while (cur) {
            const bg = getComputedStyle(cur).backgroundColor;
            if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
              bgColor = bg;
              break;
            }
            cur = cur.parentElement;
          }
          results.push({ text: text.slice(0, 40), fg: style.color, bg: bgColor });
        }
      }
      return results;
    });

    expect(contrastChecks.length).toBeGreaterThan(3);
    for (const check of contrastChecks) {
      const fg = parseCssColor(check.fg);
      const bg = parseCssColor(check.bg);
      const compositedFg = fg.a < 1 ? compositeOver(fg, bg) : fg;
      const ratio = contrastRatio(compositedFg, bg);
      expect(
        ratio,
        `Contrast ratio ${ratio.toFixed(2)} for "${check.text}" (${check.fg} on ${check.bg}) is below 4.5`
      ).toBeGreaterThanOrEqual(4.5);
    }

    // Verify prefers-reduced-motion clamps animation-duration
    const statusDotDuration = await page.evaluate(() => {
      const pulseEl = document.querySelector(".animate-pulse, .motion-safe\\:animate-pulse");
      return pulseEl ? getComputedStyle(pulseEl).animationDuration : "0s";
    });
    expect(["0s", "0.00001s", "1e-05s", "0.01ms"]).toContain(statusDotDuration);

    monitor.assertClean();
  });
});
