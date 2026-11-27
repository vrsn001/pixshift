"use client";

import React, { useState } from "react";
import {
  Sliders,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Columns2,
} from "lucide-react";
import { ConversionJob, ConversionSettings, SupportedFormat } from "@/types/converter";
import { FormatSelector } from "./FormatSelector";
import { SettingsModal } from "./SettingsModal";
import { JobThumbnail } from "./JobThumbnail";
import { VisualDiffModal } from "./VisualDiffModal";
import { triggerDownloadUrl } from "@/lib/utils/archive";

interface FileQueueProps {
  jobs: ConversionJob[];
  onUpdateFormat: (id: string, format: SupportedFormat) => void;
  onUpdateSettings: (id: string, settings: ConversionSettings, applyToAll: boolean) => void;
  onRemoveJob: (id: string) => void;
}

export function FileQueue({ jobs, onUpdateFormat, onUpdateSettings, onRemoveJob }: FileQueueProps) {
  const [activeSettingsJob, setActiveSettingsJob] = useState<ConversionJob | null>(null);
  const [activeDiffJob, setActiveDiffJob] = useState<ConversionJob | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[10px] tracking-widest uppercase text-[#8a8980]">
          02 // QUEUE ({jobs.length})
        </span>
      </div>

      {jobs.map((job) => {
        const isDone = job.status === "done";
        const isProcessing = job.status === "processing";
        const isError = job.status === "error";

        const primaryOutput = job.outputFiles?.[0];
        const canCompare =
          isDone &&
          job.category === "image" &&
          job.targetFormat !== "pdf" &&
          Boolean(primaryOutput);

        const totalOutputBytes =
          job.outputFiles?.reduce((sum, f) => sum + f.size, 0) ?? 0;
        const deltaBytes = job.size - totalOutputBytes;
        const deltaPct =
          job.size > 0 && job.outputFiles && job.outputFiles.length > 0
            ? Math.round((deltaBytes / job.size) * 100)
            : null;

        const hasInputMetadata = Boolean(job.exifInfo?.hasExif || job.exifInfo?.hasXmp);
        const exifStripped =
          isDone &&
          job.category === "image" &&
          hasInputMetadata &&
          (job.settings.stripExif !== false || job.targetFormat !== job.inputFormat);

        return (
          <div
            key={job.id}
            className="w-full rounded-xl bg-[#111113] border border-white/[0.08] p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors hover:border-white/[0.16]"
          >
            {/* Left: Thumbnail + File Info */}
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <JobThumbnail file={job.file} category={job.category} inputFormat={job.inputFormat} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-xs text-[#f0efe9] truncate max-w-[140px] sm:max-w-[200px] md:max-w-xs">
                    {job.name}
                  </span>
                  <span className="text-[10px] uppercase font-mono font-bold text-[#9a9992] bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.08]">
                    {job.inputFormat}
                  </span>

                  {/* EXIF / STRIPPED badge */}
                  {exifStripped ? (
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border bg-[#c8f03c]/10 border-[#c8f03c]/35 text-[#c8f03c]">
                      STRIPPED
                    </span>
                  ) : hasInputMetadata ? (
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border bg-[#2563eb]/20 border-[#60a5fa]/40 text-[#60a5fa]">
                      EXIF
                    </span>
                  ) : null}

                  {/* Hardware Engine Badge */}
                  {isDone && job.engineUsed && (
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                        job.engineUsed === "webcodecs"
                          ? "bg-[#2563eb]/20 border-[#60a5fa]/40 text-[#60a5fa]"
                          : "bg-white/[0.04] border-white/[0.1] text-[#9a9992]"
                      }`}
                    >
                      {job.engineUsed === "webcodecs" ? "WEBCODECS HW" : job.engineUsed}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#8a8980] mt-1 tabular-nums">
                  <span>{formatFileSize(job.size)}</span>
                  {isDone && totalOutputBytes > 0 && (
                    <>
                      <span>→ {formatFileSize(totalOutputBytes)}</span>
                      {deltaPct !== null && (
                        <span
                          className={`font-bold ${
                            deltaBytes >= 0 ? "text-[#c8f03c]" : "text-[#f03c8c]"
                          }`}
                        >
                          {deltaBytes >= 0 ? `-${deltaPct}%` : `+${Math.abs(deltaPct)}%`}
                        </span>
                      )}
                    </>
                  )}
                  {job.durationMs !== undefined && (
                    <span>· {(job.durationMs / 1000).toFixed(1)}s</span>
                  )}
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
                  aria-label={`Configure settings for ${job.name}`}
                  disabled={isProcessing}
                  onClick={() => setActiveSettingsJob(job)}
                  className="w-8 h-8 rounded-lg bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-[#9a9992] hover:text-[#c8f03c] transition-colors disabled:opacity-40 active:scale-[0.98]"
                >
                  <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Right: Status / Progress / Action */}
            <div className="flex items-center justify-between md:justify-end gap-2.5 min-w-[140px]">
              {isProcessing && (
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-[#18181b] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#c8f03c] h-full transition-all duration-300 rounded-full"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-[#c8f03c] tabular-nums">{job.progress}%</span>
                </div>
              )}

              {isDone && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-[#c8f03c] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Done</span>
                  </span>

                  {canCompare && (
                    <button
                      type="button"
                      onClick={() => setActiveDiffJob(job)}
                      aria-label={`Compare ${job.name}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.12] text-[#f0efe9] transition-colors active:scale-[0.98]"
                    >
                      <Columns2 className="w-3.5 h-3.5 text-[#60a5fa]" aria-hidden="true" />
                      <span>Compare</span>
                    </button>
                  )}

                  {job.outputFiles && job.outputFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        job.outputFiles?.forEach((out) => triggerDownloadUrl(out.url, out.name));
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#c8f03c] hover:bg-[#b5dc30] text-[#0a0a0b] transition-all shadow-md shadow-[#c8f03c]/20 active:scale-[0.98]"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Download</span>
                    </button>
                  )}
                </div>
              )}

              {isError && (
                <span className="flex items-center gap-1 text-[11px] text-[#f03c8c] font-medium" title={job.error}>
                  <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Failed</span>
                </span>
              )}

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => onRemoveJob(job.id)}
                title="Remove file"
                aria-label={`Remove ${job.name}`}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8a8980] hover:text-[#f03c8c] hover:bg-[#f03c8c]/10 transition-colors disabled:opacity-40 active:scale-[0.98]"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}

      {activeSettingsJob && (
        <SettingsModal
          isOpen={true}
          onClose={() => setActiveSettingsJob(null)}
          file={activeSettingsJob.file}
          fileName={activeSettingsJob.name}
          category={activeSettingsJob.category}
          targetFormat={activeSettingsJob.targetFormat}
          sourceDimensions={activeSettingsJob.sourceDimensions}
          durationSec={activeSettingsJob.durationSec}
          settings={activeSettingsJob.settings}
          onSave={(settings, applyToAll) =>
            onUpdateSettings(activeSettingsJob.id, settings, applyToAll)
          }
        />
      )}

      <VisualDiffModal job={activeDiffJob} onClose={() => setActiveDiffJob(null)} />
    </div>
  );
}
