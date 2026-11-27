import type {
  BatchTelemetrySnapshot,
  ConversionJob,
  ConversionSettings,
  FileCategory,
  SupportedFormat,
} from "@/types/converter";
import { AVAILABLE_TARGETS } from "@/lib/converters/registry";

export const ALL_FOLDERS_FILTER = "__all__" as const;

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

/**
 * Normalizes a job folder path into `/` separated segments with no leading/trailing
 * slashes or traversal dot segments. Returns `""` for root-level files.
 */
export function normalizeFolderPath(folderPath?: string | null): string {
  if (!folderPath) return "";
  return folderPath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
    .join("/");
}

export interface FolderSummary {
  folderPath: string;
  label: string;
  count: number;
  totalBytes: number;
  categories: FileCategory[];
  pendingCount: number;
  completedCount: number;
  errorCount: number;
}

/**
 * Summarizes queued jobs grouped by normalized folder path, placing Root (`""`)
 * first if present, followed by subfolders sorted lexicographically.
 */
export function getFolderSummaryList(jobs: readonly ConversionJob[]): FolderSummary[] {
  const buckets = new Map<
    string,
    {
      count: number;
      totalBytes: number;
      categories: Set<FileCategory>;
      pendingCount: number;
      completedCount: number;
      errorCount: number;
    }
  >();

  for (const job of jobs) {
    const key = normalizeFolderPath(job.folderPath);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        count: 0,
        totalBytes: 0,
        categories: new Set<FileCategory>(),
        pendingCount: 0,
        completedCount: 0,
        errorCount: 0,
      };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    bucket.totalBytes += job.size;
    bucket.categories.add(job.category);
    if (job.status === "pending") {
      bucket.pendingCount += 1;
    } else if (job.status === "done") {
      bucket.completedCount += 1;
    } else if (job.status === "error") {
      bucket.errorCount += 1;
    }
  }

  const summaries: FolderSummary[] = Array.from(buckets.entries()).map(([folderPath, data]) => ({
    folderPath,
    label: folderPath === "" ? "Root" : folderPath,
    count: data.count,
    totalBytes: data.totalBytes,
    categories: Array.from(data.categories),
    pendingCount: data.pendingCount,
    completedCount: data.completedCount,
    errorCount: data.errorCount,
  }));

  summaries.sort((a, b) => {
    if (a.folderPath === b.folderPath) return 0;
    if (a.folderPath === "") return -1;
    if (b.folderPath === "") return 1;
    return a.folderPath.localeCompare(b.folderPath);
  });

  return summaries;
}

/**
 * Filters jobs by folder selection (`ALL_FOLDERS_FILTER` / `null` / `undefined` returns all;
 * `""` returns root-only jobs; any other string filters by normalized folder path).
 */
export function filterJobsByFolder(
  jobs: readonly ConversionJob[],
  folderFilter?: string | null
): ConversionJob[] {
  if (folderFilter === undefined || folderFilter === null || folderFilter === ALL_FOLDERS_FILTER) {
    return [...jobs];
  }
  const normalizedTarget = normalizeFolderPath(folderFilter);
  return jobs.filter((job) => normalizeFolderPath(job.folderPath) === normalizedTarget);
}

/**
 * Checks whether a target output format is supported for the given file category.
 */
export function isFormatCompatibleWithCategory(
  category: FileCategory,
  format: SupportedFormat
): boolean {
  return AVAILABLE_TARGETS[category].includes(format);
}

export interface BulkApplyOptions {
  folderFilter?: string | null;
  categoryFilter?: FileCategory | null;
}

export interface BulkUpdateResult {
  jobs: ConversionJob[];
  updatedCount: number;
  skippedCount: number;
}

function matchesBulkScope(job: ConversionJob, options?: BulkApplyOptions): boolean {
  const folderMatches =
    options?.folderFilter === undefined ||
    options.folderFilter === null ||
    options.folderFilter === ALL_FOLDERS_FILTER ||
    normalizeFolderPath(job.folderPath) === normalizeFolderPath(options.folderFilter);

  const categoryMatches =
    options?.categoryFilter === undefined ||
    options.categoryFilter === null ||
    job.category === options.categoryFilter;

  return folderMatches && categoryMatches;
}

/**
 * Applies a target format across queued jobs (optionally scoped by folder and/or category),
 * skipping `processing` jobs and jobs whose category does not support `targetFormat`.
 */
export function applyBulkTargetFormat(
  jobs: readonly ConversionJob[],
  targetFormat: SupportedFormat,
  options?: BulkApplyOptions
): BulkUpdateResult {
  let updatedCount = 0;
  let skippedCount = 0;

  const updatedJobs = jobs.map((job): ConversionJob => {
    if (!matchesBulkScope(job, options)) {
      return job;
    }

    if (job.status === "processing" || !isFormatCompatibleWithCategory(job.category, targetFormat)) {
      skippedCount += 1;
      return job;
    }

    updatedCount += 1;
    if (job.targetFormat === targetFormat && job.status === "pending") {
      return job;
    }

    return {
      ...job,
      targetFormat,
      status: "pending",
      progress: 0,
      outputFiles: undefined,
      error: undefined,
      durationMs: undefined,
      engineUsed: undefined,
      targetUnreachableWarning: undefined,
    };
  });

  return {
    jobs: updatedJobs,
    updatedCount,
    skippedCount,
  };
}

/**
 * Merges a partial `ConversionSettings` patch across queued jobs (optionally scoped by
 * folder and/or category), cloning nested settings objects so jobs stay isolated.
 */
export function applyBulkSettings(
  jobs: readonly ConversionJob[],
  patch: Partial<ConversionSettings>,
  options?: BulkApplyOptions
): BulkUpdateResult {
  let updatedCount = 0;
  let skippedCount = 0;

  const updatedJobs = jobs.map((job): ConversionJob => {
    if (!matchesBulkScope(job, options)) {
      return job;
    }

    if (job.status === "processing") {
      skippedCount += 1;
      return job;
    }

    updatedCount += 1;
    const nextSettings: ConversionSettings = {
      ...job.settings,
      ...patch,
    };

    if (patch.crop !== undefined) {
      nextSettings.crop = patch.crop ? { ...patch.crop } : null;
    }
    if (patch.watermark !== undefined) {
      nextSettings.watermark = patch.watermark ? { ...patch.watermark } : null;
    }
    if (patch.rename !== undefined) {
      nextSettings.rename = patch.rename ? { ...patch.rename } : null;
    }

    return {
      ...job,
      settings: nextSettings,
    };
  });

  return {
    jobs: updatedJobs,
    updatedCount,
    skippedCount,
  };
}

/**
 * Aggregates live batch counters, overall progress, byte savings, and throughput
 * telemetry for `SavingsTelemetry` and workspace status headers.
 */
export function computeBatchTelemetrySnapshot(
  jobs: readonly ConversionJob[],
  elapsedMs = 0,
  zipProgressPct: number | null = null
): BatchTelemetrySnapshot {
  const totalCount = jobs.length;
  let pendingCount = 0;
  let processingCount = 0;
  let completedCount = 0;
  let errorCount = 0;
  let progressSum = 0;
  let totalInputBytes = 0;
  let completedInputBytes = 0;
  let completedOutputBytes = 0;

  for (const job of jobs) {
    totalInputBytes += job.size;

    if (job.status === "pending") {
      pendingCount += 1;
    } else if (job.status === "processing") {
      processingCount += 1;
      const clampedProgress = Number.isFinite(job.progress)
        ? Math.max(0, Math.min(100, job.progress))
        : 0;
      progressSum += clampedProgress;
    } else if (job.status === "done") {
      completedCount += 1;
      progressSum += 100;
      if (job.outputFiles && job.outputFiles.length > 0) {
        completedInputBytes += job.size;
        for (const out of job.outputFiles) {
          completedOutputBytes += out.size;
        }
      }
    } else if (job.status === "error") {
      errorCount += 1;
      progressSum += 100;
    }
  }

  const overallProgressPct = totalCount > 0 ? Math.round(progressSum / totalCount) : 0;
  const savedBytes = completedInputBytes - completedOutputBytes;
  const savedPercent =
    completedInputBytes > 0
      ? Math.round((savedBytes / completedInputBytes) * 1000) / 10
      : 0;

  const safeElapsedMs = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const elapsedSec = safeElapsedMs / 1000;
  const filesPerSec =
    elapsedSec > 0 ? Math.round((completedCount / elapsedSec) * 100) / 100 : 0;
  const mbPerSec =
    elapsedSec > 0
      ? Math.round((completedInputBytes / (1024 * 1024) / elapsedSec) * 100) / 100
      : 0;

  return {
    totalCount,
    pendingCount,
    processingCount,
    completedCount,
    errorCount,
    overallProgressPct,
    totalInputBytes,
    completedInputBytes,
    completedOutputBytes,
    savedBytes,
    savedPercent,
    filesPerSec,
    mbPerSec,
    elapsedMs: safeElapsedMs,
    zipProgressPct,
  };
}

/**
 * Returns true when the queue has more than 10 items or includes any nested folder paths,
 * signaling the UI to surface immediate mass format selection controls.
 */
export function shouldPromptMassSelection(jobs: readonly ConversionJob[]): boolean {
  return jobs.length > 10 || jobs.some((job) => normalizeFolderPath(job.folderPath) !== "");
}
