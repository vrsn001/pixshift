"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectFileInfo } from "@/lib/converters/detector";
import { inspectImageMetadata } from "@/lib/converters/exif";
import { preloadFFmpeg, transcodeMediaWithInfo } from "@/lib/converters/mediaConverter";
import { extractPdfToImages, mergeImagesToPdf } from "@/lib/converters/documentConverter";
import {
  ALL_FOLDERS_FILTER,
  applyBulkSettings,
  applyBulkTargetFormat,
  computeBatchTelemetrySnapshot,
  filterJobsByFolder,
  getFolderSummaryList,
  partitionConversionBatch,
  revokeJobUrls,
  shouldAutoResetMergeToPdf,
  shouldPromptMassSelection,
} from "@/lib/converters/workspaceHelpers";
import { buildZipEntriesFromJobs, createZipArchive, triggerDownload } from "@/lib/utils/archive";
import { createBatchedUpdater, runConcurrentPool } from "@/lib/utils/concurrency";
import { normalizeInputFileEntries } from "@/lib/utils/folderDrop";
import { resolveBatchOutputNames } from "@/lib/utils/rename";
import { convertImageViaPool } from "@/lib/engines/imageWorkerPool";
import {
  applyRecipeToJobs,
  BUILT_IN_RECIPES,
  type ConversionRecipe,
  deleteCustomRecipe,
  loadCustomRecipes,
  saveCustomRecipe,
} from "@/lib/workspace/recipes";
import type {
  ConversionJob,
  ConversionSettings,
  DroppedFileEntry,
  OutputFile,
  RenameSettings,
  SupportedFormat,
  ZipStructureMode,
} from "@/types/converter";

const DEFAULT_RENAME_SETTINGS: RenameSettings = {
  enabled: false,
  pattern: "{name}",
  prefix: "",
  suffix: "",
  startIndex: 1,
  zeroPad: 3,
};

async function probeImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch {
    return null;
  }
}

async function probeVideoMetadata(
  file: File
): Promise<{ width: number; height: number; durationSec: number } | null> {
  if (typeof document === "undefined") return null;
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.src = url;
    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : 0;
      const result =
        video.videoWidth > 0 && video.videoHeight > 0
          ? { width: video.videoWidth, height: video.videoHeight, durationSec }
          : null;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });
}

function getDefaultSettings(rename: RenameSettings): ConversionSettings {
  return {
    quality: 85,
    width: null,
    height: null,
    maintainAspectRatio: true,
    audioBitrate: "192k",
    videoQualityPreset: "balanced",
    stripExif: true,
    rename: { ...rename },
    gifLoop: 0,
  };
}

export function useConverterWorkspace() {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [mergeToPdf, setMergeToPdf] = useState(false);
  const [rejectedNotices, setRejectedNotices] = useState<string[]>([]);
  const [folderFilter, setFolderFilter] = useState<string>(ALL_FOLDERS_FILTER);
  const [zipMode, setZipMode] = useState<ZipStructureMode>("preserve");
  const [renameSettings, setRenameSettings] = useState<RenameSettings>(DEFAULT_RENAME_SETTINGS);
  const [zipProgressPct, setZipProgressPct] = useState<number | null>(null);
  const [batchElapsedMs, setBatchElapsedMs] = useState<number>(0);
  const [massBarManualOpen, setMassBarManualOpen] = useState<boolean>(false);
  const [customRecipes, setCustomRecipes] = useState<ConversionRecipe[]>([]);

  const activeOutputUrlsRef = useRef<Set<string>>(new Set());
  const jobsRef = useRef<ConversionJob[]>(jobs);
  jobsRef.current = jobs;
  const abortControllerRef = useRef<AbortController | null>(null);
  const batchStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    setCustomRecipes(loadCustomRecipes());
  }, []);

  const trackOutputFiles = useCallback((files: OutputFile[]) => {
    files.forEach((f) => activeOutputUrlsRef.current.add(f.url));
  }, []);

  const releaseJobUrls = useCallback((job: Pick<ConversionJob, "outputFiles">) => {
    revokeJobUrls(job);
    job.outputFiles?.forEach((f) => activeOutputUrlsRef.current.delete(f.url));
  }, []);

  useEffect(() => {
    const urlSet = activeOutputUrlsRef.current;
    return () => {
      abortControllerRef.current?.abort();
      urlSet.forEach((url) => URL.revokeObjectURL(url));
      urlSet.clear();
    };
  }, []);

  useEffect(() => {
    if (mergeToPdf && shouldAutoResetMergeToPdf(jobs)) {
      setMergeToPdf(false);
    }
  }, [jobs, mergeToPdf]);

  // Live timer tick during active batch conversion
  useEffect(() => {
    if (!isConverting) {
      batchStartTimeRef.current = null;
      return;
    }
    const start = batchStartTimeRef.current ?? Date.now();
    batchStartTimeRef.current = start;
    const interval = window.setInterval(() => {
      setBatchElapsedMs(Date.now() - start);
    }, 200);
    return () => window.clearInterval(interval);
  }, [isConverting]);

  const enrichJobsBounded = useCallback(async (newJobs: ConversionJob[]) => {
    const metaUpdates = createBatchedUpdater<{
      id: string;
      patch: Partial<ConversionJob>;
    }>((updates) => {
      const map = new Map(updates.map((u) => [u.id, u.patch]));
      setJobs((prev) =>
        prev.map((item) => {
          const patch = map.get(item.id);
          return patch ? { ...item, ...patch } : item;
        })
      );
    }, 80);

    try {
      await runConcurrentPool(newJobs, 4, async (job) => {
        if (job.category === "image") {
          const [exifInfo, dims] = await Promise.all([
            inspectImageMetadata(job.file),
            probeImageDimensions(job.file),
          ]);
          metaUpdates.enqueue({ id: job.id, patch: { exifInfo, sourceDimensions: dims } });
        } else if (job.category === "video") {
          const meta = await probeVideoMetadata(job.file);
          if (meta) {
            metaUpdates.enqueue({
              id: job.id,
              patch: {
                sourceDimensions: { width: meta.width, height: meta.height },
                durationSec: meta.durationSec,
              },
            });
          }
        }
      });
    } finally {
      metaUpdates.flush();
      metaUpdates.dispose();
    }
  }, []);

  const addEntries = useCallback(
    (entries: DroppedFileEntry[]) => {
      const acceptedJobs: ConversionJob[] = [];
      const rejected: string[] = [];
      const seedSettings = getDefaultSettings(renameSettings);

      for (const entry of entries) {
        const info = detectFileInfo(entry.file);
        if (!info.supported) {
          rejected.push(info.reason);
          continue;
        }

        acceptedJobs.push({
          id: `${entry.file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          file: entry.file,
          name: entry.file.name,
          size: entry.file.size,
          category: info.category,
          inputFormat: info.inputFormat,
          targetFormat: info.defaultTarget,
          status: "pending",
          progress: 0,
          relativePath: entry.relativePath,
          folderPath: entry.folderPath,
          settings: {
            ...seedSettings,
            rename: seedSettings.rename ? { ...seedSettings.rename } : undefined,
          },
        });
      }

      if (rejected.length > 0) {
        setRejectedNotices((prev) => [...prev, ...rejected].slice(-12));
      }

      if (acceptedJobs.length > 0) {
        setJobs((prev) => [...prev, ...acceptedJobs]);

        if (acceptedJobs.some((j) => j.category === "video" || j.category === "audio")) {
          preloadFFmpeg();
        }

        void enrichJobsBounded(acceptedJobs);
      }
    },
    [enrichJobsBounded, renameSettings]
  );

  const handleFilesAdded = useCallback(
    (files: File[]) => {
      addEntries(normalizeInputFileEntries(files));
    },
    [addEntries]
  );

  const updateFormat = useCallback(
    (id: string, format: SupportedFormat) => {
      const existing = jobsRef.current.find((j) => j.id === id);
      if (existing) {
        releaseJobUrls(existing);
      }
      setJobs((prev) =>
        prev.map((job) =>
          job.id !== id
            ? job
            : {
                ...job,
                targetFormat: format,
                status: "pending" as const,
                progress: 0,
                outputFiles: undefined,
                error: undefined,
                durationMs: undefined,
                engineUsed: undefined,
                targetUnreachableWarning: undefined,
                ocrText: undefined,
              }
        )
      );
    },
    [releaseJobUrls]
  );

  const updateSettings = useCallback(
    (id: string, newSettings: ConversionSettings, applyToAll: boolean) => {
      setJobs((prev) => {
        const targetJob = prev.find((j) => j.id === id);
        if (!targetJob) return prev;

        return prev.map((j) => {
          if (j.id === id || (applyToAll && j.category === targetJob.category)) {
            return {
              ...j,
              settings: {
                ...newSettings,
                crop: newSettings.crop ? { ...newSettings.crop } : null,
                watermark: newSettings.watermark ? { ...newSettings.watermark } : null,
                rename: newSettings.rename ? { ...newSettings.rename } : null,
              },
            };
          }
          return j;
        });
      });
    },
    []
  );

  const removeJob = useCallback(
    (id: string) => {
      const target = jobsRef.current.find((j) => j.id === id);
      if (target) {
        releaseJobUrls(target);
      }
      setJobs((prev) => prev.filter((j) => j.id !== id));
    },
    [releaseJobUrls]
  );

  const clearAll = useCallback(() => {
    abortControllerRef.current?.abort();
    jobsRef.current.forEach(releaseJobUrls);
    setJobs([]);
    setMergeToPdf(false);
    setRejectedNotices([]);
    setFolderFilter(ALL_FOLDERS_FILTER);
    setZipProgressPct(null);
    setBatchElapsedMs(0);
    setMassBarManualOpen(false);
  }, [releaseJobUrls]);

  const applyMassFormat = useCallback(
    (targetFormat: SupportedFormat, scopeFolder?: string) => {
      const activeScope = scopeFolder ?? folderFilter;
      setJobs((prev) => {
        const res = applyBulkTargetFormat(prev, targetFormat, {
          folderFilter: activeScope,
        });
        prev.forEach((job, idx) => {
          const updated = res.jobs[idx];
          if (updated && updated.outputFiles === undefined && job.outputFiles) {
            releaseJobUrls(job);
          }
        });
        return res.jobs;
      });
    },
    [folderFilter, releaseJobUrls]
  );

  const applyMassSettings = useCallback(
    (patch: Partial<ConversionSettings>, scopeFolder?: string) => {
      const activeScope = scopeFolder ?? folderFilter;
      setJobs((prev) => applyBulkSettings(prev, patch, { folderFilter: activeScope }).jobs);
    },
    [folderFilter]
  );

  const applyRecipe = useCallback(
    (recipe: ConversionRecipe, scopeFolder?: string) => {
      const activeScope = scopeFolder ?? folderFilter;
      setJobs((prev) => {
        const res = applyRecipeToJobs(prev, recipe, { folderFilter: activeScope });
        prev.forEach((job, idx) => {
          const updated = res.jobs[idx];
          if (updated && updated.outputFiles === undefined && job.outputFiles) {
            releaseJobUrls(job);
          }
        });
        return res.jobs;
      });
    },
    [folderFilter, releaseJobUrls]
  );

  const updateGlobalRename = useCallback((nextRename: RenameSettings) => {
    setRenameSettings(nextRename);
    setJobs((prev) => applyBulkSettings(prev, { rename: nextRename }).jobs);
  }, []);

  const replaceJobOutputFiles = useCallback(
    (jobId: string, outputFiles: OutputFile[], engineUsed: ConversionJob["engineUsed"], extra?: Partial<ConversionJob>) => {
      const existing = jobsRef.current.find((j) => j.id === jobId);
      if (existing) {
        releaseJobUrls(existing);
      }
      trackOutputFiles(outputFiles);
      setJobs((prev) =>
        prev.map((item) =>
          item.id === jobId
            ? {
                ...item,
                status: "done",
                progress: 100,
                outputFiles,
                engineUsed,
                error: undefined,
                ...extra,
              }
            : item
        )
      );
    },
    [releaseJobUrls, trackOutputFiles]
  );

  const appendJobsFromOutputs = useCallback(
    (created: { file: File; defaultTarget: SupportedFormat; folderPath?: string }[]) => {
      const entries: DroppedFileEntry[] = created.map((c) => ({
        file: c.file,
        relativePath: c.folderPath ? `${c.folderPath}/${c.file.name}` : c.file.name,
        folderPath: c.folderPath ?? "",
      }));
      addEntries(entries);
    },
    [addEntries]
  );

  const cancelBatch = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const convertAll = useCallback(async () => {
    const currentJobs = jobsRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    batchStartTimeRef.current = Date.now();
    setBatchElapsedMs(0);
    setIsConverting(true);

    const { shouldMergePdf, mergedPdfJobs, imageJobs, sequentialJobs } = partitionConversionBatch(
      currentJobs,
      mergeToPdf
    );

    // Precompute deterministic batch output names per item index
    const preserveScope = zipMode === "preserve";
    const batchRenameCandidates = currentJobs.map((job, idx) => ({
      originalName: job.name,
      targetFormat: job.targetFormat,
      index: (renameSettings.startIndex ?? 1) + idx,
      folderPath: job.folderPath,
      width: job.settings.width ?? job.sourceDimensions?.width ?? null,
      height: job.settings.height ?? job.sourceDimensions?.height ?? null,
      settings: job.settings.rename?.enabled ? job.settings.rename : renameSettings,
    }));
    const resolvedBatchNames = resolveBatchOutputNames(batchRenameCandidates, preserveScope);
    const resolvedNameByJobId = new Map<string, string>();
    currentJobs.forEach((job, idx) => {
      const resolvedName = resolvedBatchNames[idx];
      if (resolvedName) {
        resolvedNameByJobId.set(job.id, resolvedName);
      }
    });

    // Coalesce rapid progress events across parallel workers
    const progressUpdater = createBatchedUpdater<{ id: string; progress: number }>((updates) => {
      const latestProgress = new Map<string, number>();
      for (const u of updates) {
        latestProgress.set(u.id, u.progress);
      }
      setJobs((prev) =>
        prev.map((item) => {
          const pct = latestProgress.get(item.id);
          return pct !== undefined && item.status === "processing"
            ? { ...item, progress: pct }
            : item;
        })
      );
    }, 60);

    try {
      if (shouldMergePdf) {
        const firstPdfJob = mergedPdfJobs[0];
        if (firstPdfJob) {
          const startTime = Date.now();
          const mergeIds = new Set(mergedPdfJobs.map((j) => j.id));

          setJobs((prev) =>
            prev.map((item) =>
              mergeIds.has(item.id)
                ? { ...item, status: "processing", progress: 10, error: undefined }
                : item
            )
          );

          try {
            const files = mergedPdfJobs.map((j) => j.file);
            const pdfBlob = await mergeImagesToPdf(files, (pct) => {
              progressUpdater.enqueue({ id: firstPdfJob.id, progress: pct });
            });

            const durationMs = Date.now() - startTime;
            const mergedOutput: OutputFile = {
              name: "pixshift_merged_document.pdf",
              blob: pdfBlob,
              url: URL.createObjectURL(pdfBlob),
              size: pdfBlob.size,
            };
            trackOutputFiles([mergedOutput]);

            setJobs((prev) =>
              prev.map((item) => {
                if (item.id === firstPdfJob.id) {
                  releaseJobUrls(item);
                  return {
                    ...item,
                    status: "done",
                    progress: 100,
                    outputFiles: [mergedOutput],
                    durationMs,
                    engineUsed: "pdf",
                  };
                }
                if (mergeIds.has(item.id)) {
                  releaseJobUrls(item);
                  return {
                    ...item,
                    status: "done",
                    progress: 100,
                    outputFiles: undefined,
                    durationMs,
                    engineUsed: "pdf",
                  };
                }
                return item;
              })
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Merge failed";
            setJobs((prev) =>
              prev.map((item) =>
                mergeIds.has(item.id) ? { ...item, status: "error", error: msg } : item
              )
            );
          }
        }
      }

      const processJob = async (job: ConversionJob) => {
        if (controller.signal.aborted) {
          return;
        }

        releaseJobUrls(job);
        setJobs((prev) =>
          prev.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: "processing",
                  progress: 5,
                  error: undefined,
                  outputFiles: undefined,
                  targetUnreachableWarning: undefined,
                }
              : item
          )
        );
        const startTime = Date.now();

        try {
          let outputFiles: OutputFile[] = [];
          let engineUsed: ConversionJob["engineUsed"] = "canvas";
          let targetUnreachableWarning: string | undefined;
          let ocrText: string | undefined;

          const baseName = job.name.replace(/\.[^/.]+$/, "");
          const plannedFilename =
            resolvedNameByJobId.get(job.id) ?? `${baseName}.${job.targetFormat}`;

          if (job.targetFormat === "txt") {
            const { extractTextWithOcr } = await import("@/lib/engines/ocrEngine");
            const ocrRes = await extractTextWithOcr(
              job.file,
              job.category,
              { language: job.settings.ocrLanguage ?? "eng" },
              (progress) => {
                progressUpdater.enqueue({ id: job.id, progress });
              }
            );
            ocrText = ocrRes.text;
            engineUsed = "ocr";
            const txtBlob = new Blob([ocrRes.text], { type: "text/plain;charset=utf-8" });
            outputFiles = [
              {
                name: plannedFilename,
                blob: txtBlob,
                url: URL.createObjectURL(txtBlob),
                size: txtBlob.size,
              },
            ];
          } else if (job.category === "image") {
            if (job.targetFormat === "pdf") {
              const pdfBlob = await mergeImagesToPdf([job.file], (progress) => {
                progressUpdater.enqueue({ id: job.id, progress });
              });
              engineUsed = "pdf";
              outputFiles = [
                {
                  name: plannedFilename,
                  blob: pdfBlob,
                  url: URL.createObjectURL(pdfBlob),
                  size: pdfBlob.size,
                },
              ];
            } else {
              const res = await convertImageViaPool(
                job.file,
                job.targetFormat,
                job.settings,
                (progress) => {
                  progressUpdater.enqueue({ id: job.id, progress });
                }
              );
              engineUsed = job.targetFormat === "bmp" || job.targetFormat === "ico" ? "binary" : "canvas";
              targetUnreachableWarning = res.targetUnreachableWarning;
              outputFiles = [
                {
                  name: plannedFilename,
                  blob: res.blob,
                  url: URL.createObjectURL(res.blob),
                  size: res.blob.size,
                },
              ];
            }
          } else if (job.category === "video" || job.category === "audio") {
            const { blob, engine } = await transcodeMediaWithInfo(
              job.file,
              job.targetFormat,
              job.settings,
              (progress) => {
                progressUpdater.enqueue({ id: job.id, progress });
              }
            );
            engineUsed = engine;
            outputFiles = [
              {
                name: plannedFilename,
                blob,
                url: URL.createObjectURL(blob),
                size: blob.size,
              },
            ];
          } else if (job.category === "document") {
            if (job.targetFormat !== "png" && job.targetFormat !== "jpeg") {
              throw new Error(`Unsupported document target format: ${job.targetFormat}`);
            }
            const pages = await extractPdfToImages(job.file, job.targetFormat, (progress) => {
              progressUpdater.enqueue({ id: job.id, progress });
            });
            engineUsed = "pdf";
            outputFiles = pages.map((p) => ({
              name: p.name,
              blob: p.blob,
              url: URL.createObjectURL(p.blob),
              size: p.blob.size,
            }));
          }

          progressUpdater.flush();
          trackOutputFiles(outputFiles);
          const durationMs = Date.now() - startTime;
          setJobs((prev) =>
            prev.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    status: "done",
                    progress: 100,
                    outputFiles,
                    durationMs,
                    engineUsed,
                    targetUnreachableWarning,
                    ocrText,
                  }
                : item
            )
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Conversion failed";
          console.error("Conversion failed:", err);
          setJobs((prev) =>
            prev.map((item) =>
              item.id === job.id ? { ...item, status: "error", error: msg } : item
            )
          );
        }
      };

      const hwConcurrency =
        typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)
          ? Math.max(2, Math.min(6, navigator.hardwareConcurrency))
          : 4;

      if (imageJobs.length > 0 && !controller.signal.aborted) {
        await runConcurrentPool(imageJobs, hwConcurrency, processJob, {
          signal: controller.signal,
        }).catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") {
            return;
          }
          throw err;
        });
      }

      for (const job of sequentialJobs) {
        if (controller.signal.aborted) break;
        await processJob(job);
      }
    } finally {
      progressUpdater.flush();
      progressUpdater.dispose();
      if (batchStartTimeRef.current !== null) {
        setBatchElapsedMs(Date.now() - batchStartTimeRef.current);
      }
      abortControllerRef.current = null;
      setIsConverting(false);
    }
  }, [mergeToPdf, releaseJobUrls, renameSettings, trackOutputFiles, zipMode]);

  const downloadZip = useCallback(async () => {
    const entries = buildZipEntriesFromJobs(jobsRef.current, zipMode);
    if (entries.length === 0) return;
    setZipProgressPct(0);
    try {
      const zipBlob = await createZipArchive(entries, (pct) => setZipProgressPct(pct));
      triggerDownload(zipBlob, `pixshift_batch_${Date.now()}.zip`);
    } finally {
      setTimeout(() => setZipProgressPct(null), 1200);
    }
  }, [zipMode]);

  const folderSummaries = useMemo(() => getFolderSummaryList(jobs), [jobs]);
  const visibleJobs = useMemo(
    () => filterJobsByFolder(jobs, folderFilter),
    [jobs, folderFilter]
  );
  const showMassBar = massBarManualOpen || shouldPromptMassSelection(jobs);
  const telemetry = useMemo(
    () => computeBatchTelemetrySnapshot(jobs, batchElapsedMs, zipProgressPct),
    [jobs, batchElapsedMs, zipProgressPct]
  );

  const allRecipes = useMemo(
    () => [...BUILT_IN_RECIPES, ...customRecipes],
    [customRecipes]
  );

  const saveRecipe = useCallback(
    (recipe: Omit<ConversionRecipe, "id" | "isBuiltIn">) => {
      setCustomRecipes(saveCustomRecipe(recipe));
    },
    []
  );

  const removeCustomRecipe = useCallback((id: string) => {
    setCustomRecipes(deleteCustomRecipe(id));
  }, []);

  return {
    jobs,
    visibleJobs,
    folderSummaries,
    folderFilter,
    setFolderFilter,
    zipMode,
    setZipMode,
    renameSettings,
    updateGlobalRename,
    isConverting,
    mergeToPdf,
    setMergeToPdf,
    rejectedNotices,
    dismissRejectedNotices: () => setRejectedNotices([]),
    showMassBar,
    massBarManualOpen,
    setMassBarManualOpen,
    telemetry,
    allRecipes,
    saveRecipe,
    removeCustomRecipe,
    addEntries,
    handleFilesAdded,
    updateFormat,
    updateSettings,
    removeJob,
    clearAll,
    applyMassFormat,
    applyMassSettings,
    applyRecipe,
    replaceJobOutputFiles,
    appendJobsFromOutputs,
    convertAll,
    cancelBatch,
    downloadZip,
  };
}
