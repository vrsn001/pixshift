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
        return <FileVideo className="w-4 h-4 text-[#f03c8c]" />;
      case "audio":
        return <FileAudio className="w-4 h-4 text-[#c8f03c]" />;
      case "document":
        return <FileText className="w-4 h-4 text-[#f0efe9]" />;
      default:
        return <FileImage className="w-4 h-4 text-[#c8f03c]" />;
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
            className="w-full rounded-2xl bg-[#111113] border border-white/[0.08] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-white/[0.16]"
          >
            {/* Left: File Info */}
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-white/[0.07] flex items-center justify-center shrink-0">
                {getCategoryIcon(job.category)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-[#f0efe9] truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
                    {job.name}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-[#9a9992] bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                    {job.inputFormat}
                  </span>
                </div>
                <div className="text-[11px] text-[#5a5952] mt-0.5">
                  {formatFileSize(job.size)}
                  {job.durationMs && ` · ${(job.durationMs / 1000).toFixed(1)}s`}
                </div>
              </div>
            </div>

            {/* Middle: Format & Settings Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-[#9a9992]">
                <span>to</span>
                <FormatSelector
                  category={job.category}
                  selectedFormat={job.targetFormat}
                  onSelect={(fmt) => onUpdateFormat(job.id, fmt)}
                  disabled={isProcessing}
                />
              </div>

              {(job.category === "image" || job.category === "video" || job.category === "audio") && (
                <button
                  type="button"
                  title="Configure resolution and quality"
                  disabled={isProcessing}
                  onClick={() => setActiveSettingsJob(job)}
                  className="w-8 h-8 rounded-lg bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-[#9a9992] hover:text-[#c8f03c] transition-colors disabled:opacity-40"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Right: Status / Progress / Action */}
            <div className="flex items-center justify-between md:justify-end gap-3 min-w-[140px]">
              {isProcessing && (
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-[#18181b] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#c8f03c] h-full transition-all duration-300 rounded-full"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-[#c8f03c]">{job.progress}%</span>
                </div>
              )}

              {isDone && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-[#c8f03c] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Done</span>
                  </span>
                  {job.outputFiles && job.outputFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        job.outputFiles?.forEach((out) => triggerDownload(out.blob, out.name));
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#c8f03c] hover:bg-[#b5dc30] text-[#0a0a0b] transition-all shadow-md shadow-[#c8f03c]/20"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  )}
                </div>
              )}

              {isError && (
                <span className="flex items-center gap-1 text-[11px] text-[#f03c8c] font-medium" title={job.error}>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Failed</span>
                </span>
              )}

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => onRemoveJob(job.id)}
                title="Remove file"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5a5952] hover:text-[#f03c8c] hover:bg-[#f03c8c]/10 transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

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
