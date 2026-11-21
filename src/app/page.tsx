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
import { Shield, Zap, Infinity } from "lucide-react";

export default function Home() {
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

    for (const job of queueToProcess) {
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
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Background Ambience */}
      <div className="hero-grid" aria-hidden="true" />
      <div className="blob b1" aria-hidden="true" />
      <div className="blob b2" aria-hidden="true" />
      <div className="blob b3" aria-hidden="true" />

      <Header />

      <main className="max-w-4xl mx-auto px-4 pt-28 pb-16 flex-1 w-full space-y-12 relative z-10">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-2xl mx-auto pt-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.09] text-xs text-[#9a9992]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c8f03c] shadow-[0_0_8px_#c8f03c] animate-pulse" />
            <span>100% browser-based · Zero uploads · Free forever</span>
          </div>

          <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-[#f0efe9] leading-[1.05]">
            Convert <em className="not-italic text-[#c8f03c] relative inline-block underline decoration-[#c8f03c]/40 decoration-wavy decoration-2 underline-offset-8">any file</em><br />
            to anything.
          </h1>

          <p className="text-sm sm:text-base text-[#9a9992] max-w-lg mx-auto font-light leading-relaxed">
            Drop your images, videos, audio, or PDFs. Razor-sharp conversion directly on your device — no servers, no accounts, zero data leaks.
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          <div className="p-6 rounded-2xl bg-[#111113] border border-white/[0.07] space-y-2 hover:border-[#c8f03c]/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/20 flex items-center justify-center text-[#c8f03c]">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#f0efe9]">Absolute Privacy</h3>
            <p className="text-xs text-[#9a9992] leading-relaxed">
              Your files never leave your device. Processing executes strictly within your browser sandbox.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#111113] border border-white/[0.07] space-y-2 hover:border-[#c8f03c]/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/20 flex items-center justify-center text-[#c8f03c]">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#f0efe9]">Hardware Accelerated</h3>
            <p className="text-xs text-[#9a9992] leading-relaxed">
              Powered by multi-threaded WebAssembly & OffscreenCanvas for ultra-fast conversion speeds.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#111113] border border-white/[0.07] space-y-2 hover:border-[#c8f03c]/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-[#f03c8c]/10 border border-[#f03c8c]/20 flex items-center justify-center text-[#f03c8c]">
              <Infinity className="w-4 h-4" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#f0efe9]">Unlimited & Free</h3>
            <p className="text-xs text-[#9a9992] leading-relaxed">
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
