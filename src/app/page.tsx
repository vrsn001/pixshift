"use client";

import React, { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DropZone } from "@/components/converter/DropZone";
import { FileQueue } from "@/components/converter/FileQueue";
import { ActionToolbar } from "@/components/converter/ActionToolbar";
import { Faq } from "@/components/Faq";
import { ConversionJob, ConversionSettings, SupportedFormat, OutputFile } from "@/types/converter";
import { detectFileInfo } from "@/lib/converters/detector";
import { convertImage } from "@/lib/converters/imageConverter";
import { transcodeMedia } from "@/lib/converters/mediaConverter";
import { mergeImagesToPdf, extractPdfToImages } from "@/lib/converters/documentConverter";
import { createZipArchive, triggerDownload, FileToZip } from "@/lib/utils/archive";
import { Sparkles, Shield, Zap, Infinity, ArrowRight } from "lucide-react";

export default function Home() {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [mergeToPdf, setMergeToPdf] = useState(false);

  // Add files to conversion queue
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
  };

  // Update target format for a job
  const handleUpdateFormat = (id: string, format: SupportedFormat) => {
    setJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, targetFormat: format, status: "pending", progress: 0 } : job))
    );
  };

  // Update settings (optionally batch apply to all matching category)
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

  // Remove a job
  const handleRemoveJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  // Clear entire queue
  const handleClearAll = () => {
    setJobs([]);
    setMergeToPdf(false);
  };

  // Execute conversions
  const handleConvertAll = async () => {
    setIsConverting(true);

    // Case 1: Merge multiple images into a single PDF
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

          // Mark first job as done with the merged PDF, others as done
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

    // Case 2: Standard 1-to-1 conversions
    const queueToProcess = jobs.filter((j) => j.status === "pending" || j.status === "error");

    for (const job of queueToProcess) {
      // If this was part of the merged PDF handled above, skip
      if (mergeToPdf && job.category === "image" && job.targetFormat === "pdf") {
        continue;
      }

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
    }

    setIsConverting(false);
  };

  // Download all completed files in a single .zip archive
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
    <div className="flex-1 flex flex-col">
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-12 flex-1 w-full space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Universal File Conversion Studio</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Convert <span className="text-cyan-400">any file</span> to anything.
          </h1>

          <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
            Drop images, videos, audio, or PDFs. Fast, razor-sharp conversion powered by in-browser WebAssembly — zero servers, zero uploads, 100% free forever.
          </p>
        </div>

        {/* Converter Workspace */}
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

        {/* Feature Pills */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8">
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/[0.06] glass-panel space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Absolute Privacy</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your files never leave your computer. Processing executes strictly within your browser sandbox.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/[0.06] glass-panel space-y-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Hardware Accelerated</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Powered by multi-threaded WebAssembly & OffscreenCanvas for instant conversion speeds.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/[0.06] glass-panel space-y-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Infinity className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white">Unlimited & Free</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              No daily credit caps, no 10MB limits, and no subscriptions. Convert as many files as you want.
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <Faq />
      </main>

      <Footer />
    </div>
  );
}
