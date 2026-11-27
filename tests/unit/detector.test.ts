import { describe, expect, it } from "vitest";
import { detectFileInfo } from "@/lib/converters/detector";

describe("detectFileInfo", () => {
  it("test_detectFileInfo_rejects_unknown_extensions_and_mimes", () => {
    const txt = new File(["hello"], "readme.txt", { type: "text/plain" });
    const zip = new File([new Uint8Array([0x50, 0x4b])], "archive.zip", { type: "application/zip" });
    const xyz = new File([new Uint8Array([1, 2, 3])], "mystery.xyz", { type: "" });

    for (const file of [txt, zip, xyz]) {
      const result = detectFileInfo(file);
      expect(result.supported).toBe(false);
      if (!result.supported) {
        expect(result.reason).toContain(file.name);
      }
    }
  });

  it("test_detectFileInfo_accepts_known_media_and_pdf", () => {
    const cases: [File, string, string][] = [
      [new File(["a"], "pic.png", { type: "image/png" }), "image", "webp"],
      [new File(["a"], "photo.heic", { type: "" }), "image", "webp"],
      [new File(["a"], "clip.mp4", { type: "video/mp4" }), "video", "mp4"],
      [new File(["a"], "song.mp3", { type: "audio/mpeg" }), "audio", "mp3"],
      [new File(["a"], "doc.pdf", { type: "application/pdf" }), "document", "png"],
      [new File(["a"], "img.webp", { type: "image/webp" }), "image", "png"],
    ];

    for (const [file, category, defaultTarget] of cases) {
      const result = detectFileInfo(file);
      expect(result.supported).toBe(true);
      if (result.supported) {
        expect(result.category).toBe(category);
        expect(result.defaultTarget).toBe(defaultTarget);
      }
    }
  });
});
