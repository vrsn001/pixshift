"use client";

import React from "react";
import { Play, Download, Trash2, Combine, Loader2 } from "lucide-react";
import { ConversionJob } from "@/types/converter";
import { SavingsTelemetry } from "./SavingsTelemetry";

interface ActionToolbarProps {
  jobs: ConversionJob[];
  isConverting: boolean;
  onConvertAll: () => void;
  onDownloadZip: () => void;
  onClearAll: () => void;
  mergeToPdf: boolean;
  onToggleMergeToPdf: (val: boolean) => void;
}

export function ActionToolbar({
  jobs,
  isConverting,
  onConvertAll,
  onDownloadZip,
  onClearAll,
  mergeToPdf,
  onToggleMergeToPdf,
}: ActionToolbarProps) {
  const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "error");
  const completedWithOutputs = jobs.filter(
    (j) => j.status === "done" && j.outputFiles && j.outputFiles.length > 0
  );
  const hasCompleted = completedWithOutputs.length > 0;

  const imagesToPdfCount = jobs.filter(
    (j) => j.category === "image" && j.targetFormat === "pdf"
  ).length;
  const canMergePdf = imagesToPdfCount >= 2;

  const totalInputBytes = completedWithOutputs.reduce((acc, j) => acc + j.size, 0);
  const totalOutputBytes = completedWithOutputs.reduce(
    (acc, j) => acc + (j.outputFiles?.reduce((s, f) => s + f.size, 0) ?? 0),
    0
  );

  return (
    <div className="w-full rounded-xl bg-[#111113] border border-white/[0.08] p-4 space-y-3">
      {hasCompleted && (
        <SavingsTelemetry
          totalInputBytes={totalInputBytes}
          totalOutputBytes={totalOutputBytes}
          completedCount={completedWithOutputs.length}
        />
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          {canMergePdf && (
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#f0efe9] bg-white/[0.04] px-3 py-2 rounded-lg border border-white/[0.08] hover:border-[#c8f03c]/40 transition-colors">
              <Combine className="w-3.5 h-3.5 text-[#c8f03c]" aria-hidden="true" />
              <span>Merge images to single PDF</span>
              <input
                type="checkbox"
                checked={mergeToPdf}
                onChange={(e) => onToggleMergeToPdf(e.target.checked)}
                disabled={isConverting}
                className="w-4 h-4 rounded bg-[#18181b] border-white/[0.1] text-[#c8f03c] focus:ring-0 cursor-pointer"
              />
            </label>
          )}

          <button
            type="button"
            onClick={onClearAll}
            disabled={isConverting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#9a9992] hover:text-[#f03c8c] hover:bg-[#f03c8c]/10 transition-colors disabled:opacity-40 active:scale-[0.98]"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear All</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {hasCompleted && (
            <button
              type="button"
              onClick={onDownloadZip}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-[#18181b] hover:bg-white/[0.08] text-[#f0efe9] border border-white/[0.12] transition-all active:scale-[0.98]"
            >
              <Download className="w-3.5 h-3.5 text-[#c8f03c]" aria-hidden="true" />
              <span>Download All ({completedWithOutputs.length} .zip)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onConvertAll}
            disabled={isConverting || pendingJobs.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-7 py-2.5 rounded-lg text-xs font-extrabold text-[#0a0a0b] bg-[#c8f03c] hover:bg-[#b5dc30] transition-all shadow-[0_0_24px_rgba(200,240,60,0.28)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98]"
          >
            {isConverting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#0a0a0b]" aria-hidden="true" />
                <span>Converting...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Convert All ({pendingJobs.length})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
