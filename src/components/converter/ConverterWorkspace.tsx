"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { DropZone } from "@/components/converter/DropZone";
import { FileQueue } from "@/components/converter/FileQueue";
import { ActionToolbar } from "@/components/converter/ActionToolbar";
import { MassControlBar } from "@/components/converter/MassControlBar";
import { CommandPalette, type PaletteCommand } from "@/components/converter/CommandPalette";
import { GifStudioModal } from "@/components/converter/GifStudioModal";
import { PdfStudioModal } from "@/components/converter/PdfStudioModal";
import { OcrResultModal } from "@/components/converter/OcrResultModal";
import { ShareModal } from "@/components/converter/ShareModal";
import { useConverterWorkspace } from "@/lib/workspace/useConverterWorkspace";
import type { ConversionJob } from "@/types/converter";

export function ConverterWorkspace() {
  const ws = useConverterWorkspace();
  const [commandOpen, setCommandOpen] = useState(false);
  const [gifStudioJob, setGifStudioJob] = useState<ConversionJob | null>(null);
  const [pdfStudioJob, setPdfStudioJob] = useState<ConversionJob | null>(null);
  const [ocrModalJobId, setOcrModalJobId] = useState<string | null>(null);
  const [shareJob, setShareJob] = useState<ConversionJob | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commands: PaletteCommand[] = useMemo(
    () => [
      {
        id: "convert-all",
        label: "Convert All Pending Files",
        category: "Batch",
        run: () => void ws.convertAll(),
      },
      {
        id: "mass-webp",
        label: "Convert All Images to WebP",
        category: "Format",
        run: () => ws.applyMassFormat("webp"),
      },
      {
        id: "mass-avif",
        label: "Convert All Images to AVIF",
        category: "Format",
        run: () => ws.applyMassFormat("avif"),
      },
      {
        id: "mass-jpeg",
        label: "Convert All Images to JPEG",
        category: "Format",
        run: () => ws.applyMassFormat("jpeg"),
      },
      {
        id: "zip-preserve",
        label: "ZIP Mode: Preserve Nested Subfolders",
        category: "Archive",
        run: () => ws.setZipMode("preserve"),
      },
      {
        id: "zip-flatten",
        label: "ZIP Mode: Flatten Outputs to Root",
        category: "Archive",
        run: () => ws.setZipMode("flatten"),
      },
      {
        id: "toggle-mass-bar",
        label: "Toggle Mass Workbench Controls",
        category: "View",
        run: () => ws.setMassBarManualOpen((v) => !v),
      },
      {
        id: "clear-queue",
        label: "Clear All Queued Files",
        category: "Batch",
        run: ws.clearAll,
      },
    ],
    [ws]
  );

  const handleRunOcr = async (job: ConversionJob) => {
    const { extractTextWithOcr } = await import("@/lib/engines/ocrEngine");
    const res = await extractTextWithOcr(job.file, job.category, {
      language: job.settings.ocrLanguage ?? "eng",
    });
    const baseName = job.name.replace(/\.[^/.]+$/, "");
    const txtBlob = new Blob([res.text], { type: "text/plain;charset=utf-8" });
    ws.replaceJobOutputFiles(
      job.id,
      [
        {
          name: `${baseName}.txt`,
          blob: txtBlob,
          url: URL.createObjectURL(txtBlob),
          size: txtBlob.size,
        },
      ],
      "ocr",
      { ocrText: res.text }
    );
    setOcrModalJobId(job.id);
  };

  const handleMergeQueuedPdfs = async () => {
    const pdfJobs = ws.jobs.filter((j) => j.category === "document");
    if (pdfJobs.length < 2) return;
    const { mergePdfDocuments } = await import("@/lib/converters/pdfTools");
    const mergedBlob = await mergePdfDocuments(pdfJobs.map((j) => j.file));
    const mergedFile = new File([mergedBlob], "pixshift_merged_pdfs.pdf", {
      type: "application/pdf",
    });
    ws.appendJobsFromOutputs([
      { file: mergedFile, defaultTarget: "png" },
    ]);
  };

  return (
    <div className="space-y-5">
      <DropZone onEntriesAdded={ws.addEntries} onFilesAdded={ws.handleFilesAdded} hasFiles={ws.jobs.length > 0} />

      {ws.rejectedNotices.length > 0 && (
        <div
          role="alert"
          className="w-full rounded-xl bg-[#f03c8c]/10 border border-[#f03c8c]/40 px-4 py-3 flex items-start justify-between gap-3 text-xs text-[#f0efe9]"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#f03c8c] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold text-[#f03c8c]">
                Unsupported file{ws.rejectedNotices.length > 1 ? "s" : ""} skipped
              </p>
              <ul className="text-[#f0efe9]/90 space-y-0.5">
                {ws.rejectedNotices.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            onClick={ws.dismissRejectedNotices}
            aria-label="Dismiss unsupported file alert"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8a8980] hover:text-[#f0efe9] hover:bg-white/[0.06]"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {ws.jobs.length > 0 && (
        <>
          {ws.showMassBar && (
            <MassControlBar
              jobs={ws.jobs}
              visibleJobsCount={ws.visibleJobs.length}
              folderSummaries={ws.folderSummaries}
              folderFilter={ws.folderFilter}
              onFolderFilterChange={ws.setFolderFilter}
              zipMode={ws.zipMode}
              onZipModeChange={ws.setZipMode}
              renameSettings={ws.renameSettings}
              onRenameChange={ws.updateGlobalRename}
              recipes={ws.allRecipes}
              onApplyMassFormat={(fmt) => ws.applyMassFormat(fmt)}
              onApplyRecipe={(recipe) => ws.applyRecipe(recipe)}
              isConverting={ws.isConverting}
            />
          )}

          <FileQueue
            jobs={ws.visibleJobs}
            onUpdateFormat={ws.updateFormat}
            onUpdateSettings={ws.updateSettings}
            onRemoveJob={ws.removeJob}
            onOpenGifStudio={setGifStudioJob}
            onOpenPdfStudio={setPdfStudioJob}
            onRunOcrJob={(j) => void handleRunOcr(j)}
            onViewOcrText={(j) => setOcrModalJobId(j.id)}
            onShareJob={setShareJob}
          />

          <ActionToolbar
            jobs={ws.jobs}
            isConverting={ws.isConverting}
            onConvertAll={ws.convertAll}
            onCancelBatch={ws.cancelBatch}
            onDownloadZip={ws.downloadZip}
            onClearAll={ws.clearAll}
            mergeToPdf={ws.mergeToPdf}
            onToggleMergeToPdf={ws.setMergeToPdf}
            zipMode={ws.zipMode}
            telemetry={ws.telemetry}
            showMassBar={ws.showMassBar}
            onToggleMassBar={() => ws.setMassBarManualOpen((v) => !v)}
            onOpenCommandPalette={() => setCommandOpen(true)}
            onMergeQueuedPdfs={() => void handleMergeQueuedPdfs()}
          />
        </>
      )}

      <CommandPalette
        isOpen={commandOpen}
        onClose={() => setCommandOpen(false)}
        commands={commands}
      />

      <GifStudioModal
        job={gifStudioJob}
        onClose={() => setGifStudioJob(null)}
        onSaveOutput={(jobId, nextSettings, output) => {
          ws.updateSettings(jobId, nextSettings, false);
          ws.updateFormat(jobId, "gif");
          ws.replaceJobOutputFiles(jobId, [output], "ffmpeg");
        }}
      />

      <PdfStudioModal
        job={pdfStudioJob}
        onClose={() => setPdfStudioJob(null)}
        onSaveOutputs={(jobId, outputs) => {
          ws.replaceJobOutputFiles(jobId, outputs, "pdf");
        }}
      />

      <OcrResultModal
        job={ws.jobs.find((j) => j.id === ocrModalJobId) ?? null}
        onClose={() => setOcrModalJobId(null)}
      />

      <ShareModal
        job={shareJob}
        onClose={() => setShareJob(null)}
      />
    </div>
  );
}
