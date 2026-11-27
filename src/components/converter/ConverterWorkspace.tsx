"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { AlertCircle, X } from "lucide-react";
import { DropZone } from "@/components/converter/DropZone";
import { FileQueue } from "@/components/converter/FileQueue";
import { ActionToolbar } from "@/components/converter/ActionToolbar";
import {
  ConversionJob,
  ConversionSettings,
  SupportedFormat,
  OutputFile,
} from "@/types/converter";
import { detectFileInfo } from "@/lib/converters/detector";
import { convertImage } from "@/lib/converters/imageConverter";
import { transcodeMedia, preloadFFmpeg } from "@/lib/converters/mediaConverter";
import { mergeImagesToPdf, extractPdfToImages } from "@/lib/converters/documentConverter";
import { createZipArchive, triggerDownload, FileToZip } from "@/lib/utils/archive";
import {
  partitionConversionBatch,
  revokeJobUrls,
  shouldAutoResetMergeToPdf,
} from "@/components/converter/workspaceHelpers";

export function ConverterWorkspace() {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [mergeToPdf, setMergeToPdf] = useState(false);
  const [rejectedNotices, setRejectedNotices] = useState<string[]>([]);

  const activeOutputUrlsRef = useRef<Set<string>>(new Set());
  const jobsRef = useRef<ConversionJob[]>(jobs);
  jobsRef.current = jobs;

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
      urlSet.forEach((url) => URL.revokeObjectURL(url));
      urlSet.clear();
    };
  }, []);

  useEffect(() => {
    if (mergeToPdf && shouldAutoResetMergeToPdf(jobs)) {
      setMergeToPdf(false);
    }
  }, [jobs, mergeToPdf]);

  const handleFilesAdded = useCallback((files: File[]) => {
    const acceptedJobs: ConversionJob[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const info = detectFileInfo(file);
      if (!info.supported) {
        rejected.push(info.reason);
        continue;
      }

      acceptedJobs.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        category: info.category,
        inputFormat: info.inputFormat,
        targetFormat: info.defaultTarget,
        status: "pending",
        progress: 0,
        settings: {
          quality: 85,
          width: null,
          height: null,
          maintainAspectRatio: true,
          audioBitrate: "192k",
          stripExif: true,
        },
      });
    }

    if (rejected.length > 0) {
      setRejectedNotices(rejected);
    }

    if (acceptedJobs.length > 0) {
      setJobs((prev) => [...prev, ...acceptedJobs]);

      if (acceptedJobs.some((j) => j.category === "video" || j.category === "audio")) {
        preloadFFmpeg();
      }
    }
  }, []);

  const handleUpdateFormat = (id: string, format: SupportedFormat) => {
    const existing = jobsRef.current.find((j) => j.id === id);
    if (existing) {
      releaseJobUrls(existing);
    }
    setJobs((prev) =>
      prev.map((job) => {
        if (job.id !== id) return job;
        return {
          ...job,
          targetFormat: format,
          status: "pending" as const,
          progress: 0,
          outputFiles: undefined,
          error: undefined,
          durationMs: undefined,
        };
      })
    );
  };

  const handleUpdateSettings = (id: string, newSettings: ConversionSettings, applyToAll: boolean) => {
    setJobs((prev) => {
      const targetJob = prev.find((j) => j.id === id);
      if (!targetJob) return prev;

      return prev.map((j) => {
        if (j.id === id || (applyToAll && j.category === targetJob.category)) {
          return { ...j, settings: { ...newSettings } };
        }
        return j;
      });
    });
  };

  const handleRemoveJob = (id: string) => {
    const target = jobsRef.current.find((j) => j.id === id);
    if (target) {
      releaseJobUrls(target);
    }
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleClearAll = () => {
    jobsRef.current.forEach(releaseJobUrls);
    setJobs([]);
    setMergeToPdf(false);
    setRejectedNotices([]);
  };

  const handleConvertAll = async () => {
    setIsConverting(true);

    const { shouldMergePdf, mergedPdfJobs, imageJobs, sequentialJobs } = partitionConversionBatch(
      jobs,
      mergeToPdf
    );

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
            setJobs((prev) =>
              prev.map((item) => (mergeIds.has(item.id) ? { ...item, progress: pct } : item))
            );
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
      releaseJobUrls(job);
      setJobs((prev) =>
        prev.map((item) =>
          item.id === job.id
            ? { ...item, status: "processing", progress: 5, error: undefined, outputFiles: undefined }
            : item
        )
      );
      const startTime = Date.now();

      try {
        let outputFiles: OutputFile[] = [];
        const baseName = job.name.replace(/\.[^/.]+$/, "");

        if (job.category === "image") {
          if (job.targetFormat === "pdf") {
            const pdfBlob = await mergeImagesToPdf([job.file], (progress) => {
              setJobs((prev) => prev.map((item) => (item.id === job.id ? { ...item, progress } : item)));
            });
            outputFiles = [
              {
                name: `${baseName}.pdf`,
                blob: pdfBlob,
                url: URL.createObjectURL(pdfBlob),
                size: pdfBlob.size,
              },
            ];
          } else {
            const blob = await convertImage(job.file, job.targetFormat, job.settings, (progress) => {
              setJobs((prev) => prev.map((item) => (item.id === job.id ? { ...item, progress } : item)));
            });
            outputFiles = [
              {
                name: `${baseName}.${job.targetFormat}`,
                blob,
                url: URL.createObjectURL(blob),
                size: blob.size,
              },
            ];
          }
        } else if (job.category === "video" || job.category === "audio") {
          const blob = await transcodeMedia(job.file, job.targetFormat, job.settings, (progress) => {
            setJobs((prev) => prev.map((item) => (item.id === job.id ? { ...item, progress } : item)));
          });
          outputFiles = [
            {
              name: `${baseName}.${job.targetFormat}`,
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
            setJobs((prev) => prev.map((item) => (item.id === job.id ? { ...item, progress } : item)));
          });
          outputFiles = pages.map((p) => ({
            name: p.name,
            blob: p.blob,
            url: URL.createObjectURL(p.blob),
            size: p.blob.size,
          }));
        }

        trackOutputFiles(outputFiles);
        const durationMs = Date.now() - startTime;
        setJobs((prev) =>
          prev.map((item) =>
            item.id === job.id ? { ...item, status: "done", progress: 100, outputFiles, durationMs } : item
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

    const BATCH_SIZE = 3;
    for (let i = 0; i < imageJobs.length; i += BATCH_SIZE) {
      const batch = imageJobs.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(processJob));
    }

    for (const job of sequentialJobs) {
      await processJob(job);
    }

    setIsConverting(false);
  };

  const handleDownloadZip = async () => {
    const filesToZip: FileToZip[] = [];

    jobs.forEach((job) => {
      if (job.status === "done" && job.outputFiles) {
        job.outputFiles.forEach((file) => {
          filesToZip.push({
            name: file.name,
            blob: file.blob,
          });
        });
      }
    });

    if (filesToZip.length > 0) {
      const zipBlob = await createZipArchive(filesToZip);
      triggerDownload(zipBlob, `pixshift_batch_${Date.now()}.zip`);
    }
  };

  return (
    <div className="space-y-6">
      <DropZone onFilesAdded={handleFilesAdded} hasFiles={jobs.length > 0} />

      {rejectedNotices.length > 0 && (
        <div
          role="alert"
          className="w-full rounded-xl bg-[#f03c8c]/10 border border-[#f03c8c]/40 px-4 py-3 flex items-start justify-between gap-3 text-xs text-[#f0efe9]"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#f03c8c] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold text-[#f03c8c]">
                Unsupported file{rejectedNotices.length > 1 ? "s" : ""} skipped
              </p>
              <ul className="text-[#f0efe9]/90 space-y-0.5">
                {rejectedNotices.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRejectedNotices([])}
            aria-label="Dismiss unsupported file alert"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8a8980] hover:text-[#f0efe9] hover:bg-white/[0.06]"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {jobs.length > 0 && (
        <>
          <FileQueue
            jobs={jobs}
            onUpdateFormat={handleUpdateFormat}
            onUpdateSettings={handleUpdateSettings}
            onRemoveJob={handleRemoveJob}
          />

          <ActionToolbar
            jobs={jobs}
            isConverting={isConverting}
            onConvertAll={handleConvertAll}
            onDownloadZip={handleDownloadZip}
            onClearAll={handleClearAll}
            mergeToPdf={mergeToPdf}
            onToggleMergeToPdf={setMergeToPdf}
          />
        </>
      )}
    </div>
  );
}
