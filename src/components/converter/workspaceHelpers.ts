import type { ConversionJob } from "@/types/converter";

export function countImagePdfJobs(jobs: ConversionJob[]): number {
  return jobs.filter((j) => j.category === "image" && j.targetFormat === "pdf").length;
}

export function shouldAutoResetMergeToPdf(jobs: ConversionJob[]): boolean {
  return countImagePdfJobs(jobs) < 2;
}

export function revokeJobUrls(job: Pick<ConversionJob, "outputFiles">): void {
  job.outputFiles?.forEach((out) => {
    URL.revokeObjectURL(out.url);
  });
}

export interface PartitionedBatch {
  shouldMergePdf: boolean;
  mergedPdfJobs: ConversionJob[];
  imageJobs: ConversionJob[];
  sequentialJobs: ConversionJob[];
}

/**
 * Splits pending/errored jobs into merge-to-PDF batch vs individual image & sequential jobs.
 * Never skips a lone image->PDF job even if mergeToPdf is stale=true.
 */
export function partitionConversionBatch(
  jobs: ConversionJob[],
  mergeToPdf: boolean
): PartitionedBatch {
  const queueToProcess = jobs.filter((j) => j.status === "pending" || j.status === "error");
  const eligiblePdfJobs = queueToProcess.filter(
    (j) => j.category === "image" && j.targetFormat === "pdf"
  );
  const shouldMergePdf = mergeToPdf && eligiblePdfJobs.length >= 2;
  const mergedPdfJobs = shouldMergePdf ? eligiblePdfJobs : [];

  const imageJobs = queueToProcess.filter(
    (j) => j.category === "image" && !(shouldMergePdf && j.targetFormat === "pdf")
  );
  const sequentialJobs = queueToProcess.filter((j) => j.category !== "image");

  return {
    shouldMergePdf,
    mergedPdfJobs,
    imageJobs,
    sequentialJobs,
  };
}
