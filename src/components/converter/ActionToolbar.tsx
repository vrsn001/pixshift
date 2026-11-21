"use client";

import React from "react";
import { Play, Download, Trash2, Combine, Loader2 } from "lucide-react";
import { ConversionJob } from "@/types/converter";

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
  const completedJobs = jobs.filter((j) => j.status === "done");
  const hasCompleted = completedJobs.length > 0;

  const imagesToPdfCount = jobs.filter(
    (j) => j.category === "image" && j.targetFormat === "pdf"
  ).length;
  const canMergePdf = imagesToPdfCount >= 2;

  return (
    <div className="w-full rounded-2xl bg-[#111113] border border-white/[0.08] p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
      {/* Left */}
      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
        {canMergePdf && (
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#f0efe9] bg-white/[0.04] px-3.5 py-2 rounded-xl border border-white/[0.08] hover:border-[#c8f03c]/40 transition-colors">
            <Combine className="w-3.5 h-3.5 text-[#c8f03c]" />
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#9a9992] hover:text-[#f03c8c] hover:bg-[#f03c8c]/10 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear All</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        {hasCompleted && (
          <button
            type="button"
            onClick={onDownloadZip}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#18181b] hover:bg-white/[0.08] text-[#f0efe9] border border-white/[0.1] transition-all"
          >
            <Download className="w-3.5 h-3.5 text-[#c8f03c]" />
            <span>Download All ({completedJobs.length} .zip)</span>
          </button>
        )}

        <button
          type="button"
          onClick={onConvertAll}
          disabled={isConverting || pendingJobs.length === 0}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-7 py-2.5 rounded-xl text-xs font-extrabold text-[#0a0a0b] bg-[#c8f03c] hover:bg-[#b5dc30] transition-all shadow-[0_0_30px_rgba(200,240,60,0.3)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {isConverting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#0a0a0b]" />
              <span>Converting...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Convert All ({pendingJobs.length})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
