"use client";

import React, { useState } from "react";
import { DropZone } from "@/components/converter/DropZone";
import { FileQueue } from "@/components/converter/FileQueue";
import { ActionToolbar } from "@/components/converter/ActionToolbar";
import { ConversionJob, ConversionSettings, SupportedFormat, OutputFile } from "@/types/converter";
import { detectFileInfo } from "@/lib/converters/detector";
import { convertImage } from "@/lib/converters/imageConverter";
import { transcodeMedia, preloadFFmpeg } from "@/lib/converters/mediaConverter";
import { mergeImagesToPdf, extractPdfToImages } from "@/lib/converters/documentConverter";
import { createZipArchive, triggerDownload, FileToZip } from "@/lib/utils/archive";

export function ConverterWorkspace() {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [mergeToPdf, setMergeToPdf] = useState(false);

  const handleFilesAdded = (files: File[]) => {
    const newJobs: ConversionJob[] = files.map((file) => {
      const info = detectFileInfo(file);
      return {
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
        },
      };
    });

    setJobs((prev) => [...prev, ...newJobs]);

    if (newJobs.some((j) => j.category === "video" || j.category === "audio")) {
      preloadFFmpeg();
    }
  };

  const handleUpdateFormat = (id: string, format: SupportedFormat) => {
    setJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, targetFormat: format, status: "pending", progress: 0 } : job))
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
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleClearAll = () => {
    setJobs([]);
    setMergeToPdf(false);
  };

  const handleConvertAll = async () => {
    setIsConverting(true);

    if (mergeToPdf) {
      const imagePdfJobs = jobs.filter(
        (j) => j.category === "image" && j.targetFormat === "pdf" && (j.status === "pending" || j.status === "error")
      );

      if (imagePdfJobs.length >= 2) {
        const startTime = Date.now();
        imagePdfJobs.forEach((j) => {
          setJobs((prev) => prev.map((item) => (item.id === j.id ? { ...item, status: "processing", progress: 10 } : item)));
        });

        try {
          const files = imagePdfJobs.map((j) => j.file);
          const pdfBlob = await mergeImagesToPdf(files, (pct) => {
            imagePdfJobs.forEach((j) => {
              setJobs((prev) => prev.map((item) => (item.id === j.id ? { ...item, progress: pct } : item)));
            });
          });

          const durationMs = Date.now() - startTime;
          const mergedOutput: OutputFile = {
            name: "pixshift_merged_document.pdf",
            blob: pdfBlob,
            url: URL.createObjectURL(pdfBlob),
            size: pdfBlob.size,
          };

          setJobs((prev) =>
            prev.map((item) => {
              if (item.id === imagePdfJobs[0].id) {
                return {
                  ...item,
                  status: "done",
                  progress: 100,
                  outputFiles: [mergedOutput],
                  durationMs,
                };
              }
              if (imagePdfJobs.some((j) => j.id === item.id)) {
                return {
                  ...item,
                  status: "done",
                  progress: 100,
                  durationMs,
                };
              }
              return item;
            })
          );
        } catch (err: any) {
          imagePdfJobs.forEach((j) => {
            setJobs((prev) =>
              prev.map((item) =>
                item.id === j.id ? { ...item, status: "error", error: err.message || "Merge failed" } : item
              )
            );
          });
        }
      }
    }

    const queueToProcess = jobs.filter((j) => j.status === "pending" || j.status === "error");

    const processJob = async (job: ConversionJob) => {
      setJobs((prev) => prev.map((item) => (item.id === job.id ? { ...item, status: "processing", progress: 5 } : item)));
      const startTime = Date.now();

      try {
        let outputFiles: OutputFile[] = [];
        const baseName = job.name.replace(/\.[^/.]+$/, "");

        if (job.category === "image") {
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
          const pages = await extractPdfToImages(job.file, job.targetFormat as "png" | "jpeg", (progress) => {
            setJobs((prev) => prev.map((item) => (item.id === job.id ? { ...item, progress } : item)));
          });
          outputFiles = pages.map((p) => ({
            name: p.name,
            blob: p.blob,
            url: URL.createObjectURL(p.blob),
            size: p.blob.size,
          }));
        }

        const durationMs = Date.now() - startTime;
        setJobs((prev) =>
          prev.map((item) =>
            item.id === job.id ? { ...item, status: "done", progress: 100, outputFiles, durationMs } : item
          )
        );
      } catch (err: any) {
        console.error("Conversion failed:", err);
        setJobs((prev) =>
          prev.map((item) =>
            item.id === job.id ? { ...item, status: "error", error: err.message || "Conversion failed" } : item
          )
        );
      }
    };

    const imageJobs = queueToProcess.filter(
      (j) => j.category === "image" && !(mergeToPdf && j.targetFormat === "pdf")
    );
    const sequentialJobs = queueToProcess.filter(
      (j) => j.category !== "image"
    );

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
