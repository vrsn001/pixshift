import { describe, expect, it, vi } from "vitest";
import type { ConversionJob } from "@/types/converter";
import {
  ALL_FOLDERS_FILTER,
  applyBulkSettings,
  applyBulkTargetFormat,
  computeBatchTelemetrySnapshot,
  countImagePdfJobs,
  filterJobsByFolder,
  getFolderSummaryList,
  isFormatCompatibleWithCategory,
  normalizeFolderPath,
  partitionConversionBatch,
  revokeJobUrls,
  shouldAutoResetMergeToPdf,
  shouldPromptMassSelection,
} from "@/lib/converters/workspaceHelpers";

function makeJob(overrides: Partial<ConversionJob> = {}): ConversionJob {
  const file = new File(["abc"], "photo.png", { type: "image/png" });
  return {
    id: "job-1",
    file,
    name: "photo.png",
    size: 3,
    category: "image",
    inputFormat: "png",
    targetFormat: "webp",
    status: "pending",
    progress: 0,
    settings: {
      quality: 85,
      width: null,
      height: null,
      maintainAspectRatio: true,
      stripExif: true,
    },
    ...overrides,
  };
}

describe("workspaceHelpers", () => {
  it("test_mergeToPdf_resets_when_fewer_than_two_image_pdf_jobs_remain", () => {
    const twoPdfJobs = [
      makeJob({ id: "1", targetFormat: "pdf" }),
      makeJob({ id: "2", targetFormat: "pdf" }),
    ];
    expect(countImagePdfJobs(twoPdfJobs)).toBe(2);
    expect(shouldAutoResetMergeToPdf(twoPdfJobs)).toBe(false);

    const oneRemaining = [makeJob({ id: "1", targetFormat: "pdf" })];
    expect(countImagePdfJobs(oneRemaining)).toBe(1);
    expect(shouldAutoResetMergeToPdf(oneRemaining)).toBe(true);

    const retargetedToWebp = [
      makeJob({ id: "1", targetFormat: "pdf" }),
      makeJob({ id: "2", targetFormat: "webp" }),
    ];
    expect(shouldAutoResetMergeToPdf(retargetedToWebp)).toBe(true);
  });

  it("test_lone_image_pdf_job_is_not_filtered_out_of_conversion_batch", () => {
    const loneJob = makeJob({ id: "lone", targetFormat: "pdf", status: "pending" });
    // Even if mergeToPdf flag were stale=true, single image->pdf must run individually
    const batch = partitionConversionBatch([loneJob], true);
    expect(batch.shouldMergePdf).toBe(false);
    expect(batch.mergedPdfJobs).toHaveLength(0);
    expect(batch.imageJobs.map((j) => j.id)).toEqual(["lone"]);
  });

  it("revokes all output blob URLs on a job", () => {
    const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const job = makeJob({
      outputFiles: [
        { name: "a.webp", blob: new Blob(["1"]), url: "blob:http://localhost/1", size: 1 },
        { name: "b.webp", blob: new Blob(["2"]), url: "blob:http://localhost/2", size: 1 },
      ],
    });
    revokeJobUrls(job);
    expect(spy).toHaveBeenCalledWith("blob:http://localhost/1");
    expect(spy).toHaveBeenCalledWith("blob:http://localhost/2");
    spy.mockRestore();
  });

  it("normalizes folder paths, summarizes folders, and filters jobs by folder", () => {
    expect(normalizeFolderPath("/photos\\day1/../sub/")).toBe("photos/day1/sub");
    expect(normalizeFolderPath("/")).toBe("");
    expect(normalizeFolderPath(null)).toBe("");

    const jobs = [
      makeJob({ id: "1", folderPath: "trip/day2", size: 100, status: "done" }),
      makeJob({ id: "2", folderPath: "", size: 200, status: "pending" }),
      makeJob({ id: "3", folderPath: "/trip\\day1/", size: 300, status: "error", category: "audio" }),
      makeJob({ id: "4", folderPath: undefined, size: 50, status: "pending" }),
    ];

    const summaries = getFolderSummaryList(jobs);
    expect(summaries.map((s) => [s.folderPath, s.label, s.count, s.totalBytes])).toEqual([
      ["", "Root", 2, 250],
      ["trip/day1", "trip/day1", 1, 300],
      ["trip/day2", "trip/day2", 1, 100],
    ]);

    expect(filterJobsByFolder(jobs, ALL_FOLDERS_FILTER).map((j) => j.id)).toEqual(["1", "2", "3", "4"]);
    expect(filterJobsByFolder(jobs, "").map((j) => j.id)).toEqual(["2", "4"]);
    expect(filterJobsByFolder(jobs, "/trip\\day1/").map((j) => j.id)).toEqual(["3"]);
  });

  it("checks format compatibility and applies bulk target format respecting folder scope and status", () => {
    expect(isFormatCompatibleWithCategory("image", "avif")).toBe(true);
    expect(isFormatCompatibleWithCategory("document", "pdf")).toBe(false);
    expect(isFormatCompatibleWithCategory("audio", "flac")).toBe(true);

    const jobs = [
      makeJob({ id: "img-pending", category: "image", targetFormat: "webp", folderPath: "a", status: "pending" }),
      makeJob({
        id: "img-done",
        category: "image",
        targetFormat: "webp",
        folderPath: "a",
        status: "done",
        progress: 100,
        outputFiles: [{ name: "x.webp", blob: new Blob(["1"]), url: "blob:1", size: 1 }],
      }),
      makeJob({ id: "img-proc", category: "image", targetFormat: "webp", folderPath: "a", status: "processing", progress: 40 }),
      makeJob({ id: "doc-pending", category: "document", targetFormat: "png", folderPath: "a", status: "pending" }),
      makeJob({ id: "img-other-folder", category: "image", targetFormat: "webp", folderPath: "b", status: "pending" }),
    ];

    const result = applyBulkTargetFormat(jobs, "avif", { folderFilter: "a" });
    expect(result.updatedCount).toBe(2);
    expect(result.skippedCount).toBe(2); // img-proc + doc-pending (incompatible with avif)

    const byId = Object.fromEntries(result.jobs.map((j) => [j.id, j]));
    expect(byId["img-pending"]?.targetFormat).toBe("avif");
    expect(byId["img-done"]?.targetFormat).toBe("avif");
    expect(byId["img-done"]?.status).toBe("pending");
    expect(byId["img-done"]?.outputFiles).toBeUndefined();
    expect(byId["img-proc"]?.targetFormat).toBe("webp");
    expect(byId["doc-pending"]?.targetFormat).toBe("png");
    expect(byId["img-other-folder"]?.targetFormat).toBe("webp");
  });

  it("applies bulk settings with isolated nested clones and skips processing jobs", () => {
    const jobs = [
      makeJob({ id: "j1", folderPath: "", status: "pending" }),
      makeJob({ id: "j2", folderPath: "", status: "processing" }),
      makeJob({ id: "j3", folderPath: "sub", status: "pending" }),
    ];

    const res = applyBulkSettings(
      jobs,
      {
        quality: 72,
        rename: { enabled: true, pattern: "{name}_{index}" },
      },
      { folderFilter: "" }
    );

    expect(res.updatedCount).toBe(1);
    expect(res.skippedCount).toBe(1);
    expect(res.jobs[0]?.settings.quality).toBe(72);
    expect(res.jobs[0]?.settings.rename?.pattern).toBe("{name}_{index}");
    expect(res.jobs[1]?.settings.quality).toBe(85);
    expect(res.jobs[2]?.settings.quality).toBe(85);
  });

  it("computes batch telemetry snapshot and mass selection prompt trigger", () => {
    const jobs = [
      makeJob({
        id: "1",
        size: 1024 * 1024,
        status: "done",
        progress: 100,
        outputFiles: [{ name: "1.webp", blob: new Blob(["1"]), url: "blob:1", size: 512 * 1024 }],
      }),
      makeJob({
        id: "2",
        size: 1024 * 1024,
        status: "processing",
        progress: 50,
      }),
      makeJob({
        id: "3",
        size: 1024 * 1024,
        status: "pending",
        progress: 0,
      }),
      makeJob({
        id: "4",
        size: 1024 * 1024,
        status: "error",
        progress: 0,
      }),
    ];

    const snap = computeBatchTelemetrySnapshot(jobs, 2000, 42);
    expect(snap).toEqual({
      totalCount: 4,
      pendingCount: 1,
      processingCount: 1,
      completedCount: 1,
      errorCount: 1,
      overallProgressPct: 63,
      totalInputBytes: 4 * 1024 * 1024,
      completedInputBytes: 1024 * 1024,
      completedOutputBytes: 512 * 1024,
      savedBytes: 512 * 1024,
      savedPercent: 50,
      filesPerSec: 0.5,
      mbPerSec: 0.5,
      elapsedMs: 2000,
      zipProgressPct: 42,
    });

    expect(shouldPromptMassSelection([makeJob({ folderPath: "" })])).toBe(false);
    expect(shouldPromptMassSelection([makeJob({ folderPath: "album" })])).toBe(true);
    expect(
      shouldPromptMassSelection(
        Array.from({ length: 11 }, (_, idx) => makeJob({ id: `j-${idx}`, folderPath: "" }))
      )
    ).toBe(true);
  });
});
