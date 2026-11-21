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

  // Check if multiple images are set to output as PDF
  const imagesToPdfCount = jobs.filter(
    (j) => j.category === "image" && j.targetFormat === "pdf"
  ).length;
  const canMergePdf = imagesToPdfCount >= 2;

  return (
    <div className="w-full rounded-2xl bg-slate-900/80 border border-white/[0.08] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 glass-panel">
      {/* Left: Optional Merge PDF Switch & Clear */}
      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
        {canMergePdf && (
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300 bg-white/[0.04] px-3 py-1.5 rounded-xl border border-white/[0.08] hover:border-cyan-500/40 transition-colors">
            <Combine className="w-3.5 h-3.5 text-cyan-400" />
            <span>Merge images to single PDF</span>
            <input
              type="checkbox"
              checked={mergeToPdf}
              onChange={(e) => onToggleMergeToPdf(e.target.checked)}
              disabled={isConverting}
              className="w-4 h-4 rounded bg-slate-800 border-white/[0.1] text-cyan-500 focus:ring-0 cursor-pointer"
            />
          </label>
        )}

        <button
          type="button"
          onClick={onClearAll}
          disabled={isConverting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear All</span>
        </button>
      </div>

      {/* Right: Primary CTAs */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
        {hasCompleted && (
          <button
            type="button"
            onClick={onDownloadZip}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.1] transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download All ({completedJobs.length} as .zip)</span>
          </button>
        )}

        <button
          type="button"
          onClick={onConvertAll}
          disabled={isConverting || pendingJobs.length === 0}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-400 hover:from-cyan-300 hover:to-teal-200 transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {isConverting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
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
