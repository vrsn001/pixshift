import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createZipArchive, deduplicateArchivePath } from "@/lib/utils/archive";

describe("archive utilities", () => {
  it("test_createZipArchive_deduplicates_colliding_filenames", async () => {
    const b1 = new Blob(["first"], { type: "image/webp" });
    const b2 = new Blob(["second"], { type: "image/webp" });
    const b3 = new Blob(["third"], { type: "image/webp" });

    const zipBlob = await createZipArchive([
      { name: "photo.webp", blob: b1 },
      { name: "photo.webp", blob: b2 },
      { name: "photo.webp", blob: b3 },
    ]);

    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    const entryNames = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir).sort();
    expect(entryNames).toEqual(["photo (1).webp", "photo (2).webp", "photo.webp"]);

    expect(await zip.file("photo.webp")?.async("string")).toBe("first");
    expect(await zip.file("photo (1).webp")?.async("string")).toBe("second");
    expect(await zip.file("photo (2).webp")?.async("string")).toBe("third");
  });

  it("test_createZipArchive_deduplicates_within_same_folder_only", () => {
    const used = new Set<string>();
    expect(deduplicateArchivePath("page.png", "doc1", used)).toBe("page.png");
    expect(deduplicateArchivePath("page.png", "doc2", used)).toBe("page.png");
    expect(deduplicateArchivePath("page.png", "doc1", used)).toBe("page (1).png");
  });
});
