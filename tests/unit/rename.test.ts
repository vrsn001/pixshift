import { describe, expect, it } from "vitest";
import {
  formatOutputFilename,
  resolveBatchOutputNames,
  sanitizeFilenameSegment,
} from "@/lib/utils/rename";
import type { RenameSettings } from "@/types/converter";

describe("rename utilities", () => {
  it("keeps sanitized original stem with new extension when rename is disabled", () => {
    expect(
      formatOutputFilename({
        originalName: "vacation/summer.photo.png",
        targetFormat: "webp",
        settings: null,
      })
    ).toBe("summer.photo.webp");

    expect(
      formatOutputFilename({
        originalName: "brochure.pdf",
        targetFormat: "png",
        pageNumber: 3,
        settings: { enabled: false, pattern: "{index}" },
      })
    ).toBe("brochure_page_3.png");
  });

  it("expands all supported rename tokens deterministically with prefix and suffix", () => {
    const settings: RenameSettings = {
      enabled: true,
      pattern: "{folder}_{name}_{index:3}_{width}x{height}_{date}_{format}_{ext}",
      prefix: "px_",
      suffix: "_final",
      startIndex: 1,
      zeroPad: 2,
    };

    const out = formatOutputFilename({
      originalName: "IMG_01.jpg",
      targetFormat: ".WEBP",
      index: 7,
      folderPath: "trip\\day 1",
      width: 1920,
      height: 1080,
      date: "2026-11-27",
      settings,
    });

    expect(out).toBe("px_trip_day 1_IMG_01_007_1920x1080_2026-11-27_webp_webp_final.webp");
  });

  it("formats UTC YYYY-MM-DD from Date object and avoids double extensions", () => {
    const out = formatOutputFilename({
      originalName: "banner.png",
      targetFormat: "webp",
      date: new Date("2026-01-05T23:55:00Z"),
      settings: {
        enabled: true,
        pattern: "{date}_{name}.{ext}",
        suffix: ".webp",
      },
    });

    expect(out).toBe("2026-01-05_banner.webp");
  });

  it("sanitizes invalid chars, control chars, traversal dots, reserved Windows names, and empty stems", () => {
    expect(sanitizeFilenameSegment("a<b>c:d/e\\f|g?h*i\u0000\u001f")).toBe("a_b_c_d_e_f_g_h_i");
    expect(sanitizeFilenameSegment("CON")).toBe("CON_");
    expect(sanitizeFilenameSegment("nul.bak")).toBe("nul_.bak");

    expect(
      formatOutputFilename({
        originalName: "../../etc/passwd.png",
        targetFormat: "webp",
        settings: {
          enabled: true,
          pattern: "../../{name}",
        },
      })
    ).toBe("passwd.webp");

    expect(
      formatOutputFilename({
        originalName: "....png",
        targetFormat: "webp",
      })
    ).toBe("file.webp");

    expect(
      formatOutputFilename({
        originalName: "CON.png",
        targetFormat: "webp",
      })
    ).toBe("CON_.webp");
  });

  it("appends pageNumber when rename pattern lacks an index token", () => {
    const out = formatOutputFilename({
      originalName: "deck.pdf",
      targetFormat: "png",
      pageNumber: 2,
      index: 2,
      settings: {
        enabled: true,
        pattern: "{name}_export",
      },
    });
    expect(out).toBe("deck_export_page_2.png");

    const indexedOut = formatOutputFilename({
      originalName: "deck.pdf",
      targetFormat: "png",
      pageNumber: 2,
      index: 2,
      settings: {
        enabled: true,
        pattern: "{name}_{index:2}",
      },
    });
    expect(indexedOut).toBe("deck_02.png");
  });

  it("resolves batch output names with folder-scoped vs global case-insensitive deduplication", () => {
    const settings: RenameSettings = {
      enabled: true,
      pattern: "{name}",
    };

    const items = [
      { originalName: "Photo.png", targetFormat: "webp", folderPath: "day1", settings },
      { originalName: "photo.jpg", targetFormat: "webp", folderPath: "day2", settings },
      { originalName: "photo.png", targetFormat: "webp", folderPath: "day1", settings },
    ];

    expect(resolveBatchOutputNames(items, true)).toEqual([
      "Photo.webp",
      "photo.webp",
      "photo (1).webp",
    ]);

    expect(resolveBatchOutputNames(items, false)).toEqual([
      "Photo.webp",
      "photo (1).webp",
      "photo (2).webp",
    ]);
  });
});
