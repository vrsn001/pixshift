"use client";

import React, { useState } from "react";
import {
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  Sliders,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { ConversionJob, ConversionSettings, SupportedFormat } from "@/types/converter";
import { FormatSelector } from "./FormatSelector";
import { SettingsModal } from "./SettingsModal";
import { triggerDownload } from "@/lib/utils/archive";

interface FileQueueProps {
  jobs: ConversionJob[];
  onUpdateFormat: (id: string, format: SupportedFormat) => void;
  onUpdateSettings: (id: string, settings: ConversionSettings, applyToAll: boolean) => void;
  onRemoveJob: (id: string) => void;
}

export function FileQueue({ jobs, onUpdateFormat, onUpdateSettings, onRemoveJob }: FileQueueProps) {
  const [activeSettingsJob, setActiveSettingsJob] = useState<ConversionJob | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "video":
        return <FileVideo className="w-4 h-4 text-violet-400" />;
      case "audio":
        return <FileAudio className="w-4 h-4 text-emerald-400" />;
      case "document":
        return <FileText className="w-4 h-4 text-amber-400" />;
      default:
        return <FileImage className="w-4 h-4 text-cyan-400" />;
    }
  };

  return (
    <div className="w-full space-y-3">
      {jobs.map((job) => {
        const isDone = job.status === "done";
        const isProcessing = job.status === "processing";
        const isError = job.status === "error";

        return (
          <div
            key={job.id}
            className="w-full rounded-2xl bg-slate-900/60 border border-white/[0.08] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-white/[0.14] glass-panel"
          >
            {/* Left: File Info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-white/[0.06] flex items-center justify-center shrink-0">
                {getCategoryIcon(job.category)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-white truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                    {job.name}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-500 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                    {job.inputFormat}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {formatFileSize(job.size)}
                  {job.durationMs && ` · ${(job.durationMs / 1000).toFixed(1)}s`}
                </div>
              </div>
            </div>

            {/* Middle: Format & Settings Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>to</span>
                <FormatSelector
                  category={job.category}
                  selectedFormat={job.targetFormat}
                  onSelect={(fmt) => onUpdateFormat(job.id, fmt)}
                  disabled={isProcessing}
                />
              </div>

              {/* Settings button */}
              {(job.category === "image" || job.category === "video" || job.category === "audio") && (
                <button
                  type="button"
                  title="Configure resolution and quality"
                  disabled={isProcessing}
                  onClick={() => setActiveSettingsJob(job)}
                  className="w-8 h-8 rounded-lg bg-slate-800/70 hover:bg-slate-700/80 border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-cyan-400 transition-colors disabled:opacity-40"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Right: Status / Progress / Action */}
            <div className="flex items-center justify-between md:justify-end gap-3 min-w-[140px]">
              {isProcessing && (
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-cyan-400 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-cyan-400">{job.progress}%</span>
                </div>
              )}

              {isDone && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Done</span>
                  </span>
                  {job.outputFiles && job.outputFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        job.outputFiles?.forEach((out) => triggerDownload(out.blob, out.name));
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-all shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  )}
                </div>
              )}

              {isError && (
                <span className="flex items-center gap-1 text-[11px] text-rose-400 font-medium" title={job.error}>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Failed</span>
                </span>
              )}

              {/* Remove button */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => onRemoveJob(job.id)}
                title="Remove file"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Settings Modal */}
      {activeSettingsJob && (
        <SettingsModal
          isOpen={true}
          onClose={() => setActiveSettingsJob(null)}
          fileName={activeSettingsJob.name}
          category={activeSettingsJob.category}
          settings={activeSettingsJob.settings}
          onSave={(settings, applyToAll) =>
            onUpdateSettings(activeSettingsJob.id, settings, applyToAll)
          }
        />
      )}
    </div>
  );
}
