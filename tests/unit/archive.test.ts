import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { ConversionJob } from "@/types/converter";
import {
  buildZipEntriesFromJobs,
  createZipArchive,
  deduplicateArchivePath,
  normalizeArchiveFolder,
} from "@/lib/utils/archive";

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
    expect(deduplicateArchivePath("Page.PNG", "/doc1/", used)).toBe("Page (2).PNG");
  });

  it("normalizes archive folders, builds preserve vs flatten entries from jobs, and reports progress 100", async () => {
    expect(normalizeArchiveFolder("/photos\\day1/../sub/")).toBe("photos/day1/sub");
    expect(normalizeArchiveFolder("/")).toBe("");

    const makeDoneJob = (id: string, name: string, folderPath: string, content: string): ConversionJob => ({
      id,
      file: new File([content], name),
      name,
      size: content.length,
      category: "image",
      inputFormat: "png",
      targetFormat: "webp",
      status: "done",
      progress: 100,
      folderPath,
      settings: { quality: 85, maintainAspectRatio: true },
      outputFiles: [{ name, blob: new Blob([content]), url: `blob:${id}`, size: content.length }],
    });

    const jobs: ConversionJob[] = [
      makeDoneJob("1", "photo.webp", "/trip\\day1/", "day1-data"),
      makeDoneJob("2", "photo.webp", "trip/day2", "day2-data"),
      makeDoneJob("3", "root.webp", "/", "root-data"),
    ];

    const preservedEntries = buildZipEntriesFromJobs(jobs, "preserve");
    expect(preservedEntries.map((e) => ({ name: e.name, folder: e.folder }))).toEqual([
      { name: "photo.webp", folder: "trip/day1" },
      { name: "photo.webp", folder: "trip/day2" },
      { name: "root.webp", folder: undefined },
    ]);

    const progressValues: number[] = [];
    const preservedZipBlob = await createZipArchive(preservedEntries, (pct) => {
      progressValues.push(pct);
    });
    expect(progressValues.at(-1)).toBe(100);

    const preservedZip = await JSZip.loadAsync(await preservedZipBlob.arrayBuffer());
    const preservedPaths = Object.keys(preservedZip.files)
      .filter((n) => !preservedZip.files[n]?.dir)
      .sort();
    expect(preservedPaths).toEqual([
      "root.webp",
      "trip/day1/photo.webp",
      "trip/day2/photo.webp",
    ]);

    const flattenedEntries = buildZipEntriesFromJobs(jobs, "flatten");
    const flattenedZipBlob = await createZipArchive(flattenedEntries);
    const flattenedZip = await JSZip.loadAsync(await flattenedZipBlob.arrayBuffer());
    const flattenedPaths = Object.keys(flattenedZip.files)
      .filter((n) => !flattenedZip.files[n]?.dir)
      .sort();
    expect(flattenedPaths).toEqual(["photo (1).webp", "photo.webp", "root.webp"]);
  });
});
