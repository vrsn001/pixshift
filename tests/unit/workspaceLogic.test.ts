import { describe, expect, it, vi } from "vitest";
import type { ConversionJob } from "@/types/converter";
import {
  countImagePdfJobs,
  partitionConversionBatch,
  revokeJobUrls,
  shouldAutoResetMergeToPdf,
} from "@/components/converter/workspaceHelpers";

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
});
