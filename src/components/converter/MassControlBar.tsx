"use client";

import React, { useMemo, useState } from "react";
import {
  FolderTree,
  Layers,
  Sparkles,
  Tag,
  Wand2,
  FolderArchive,
  AlignLeft,
  ChevronDown,
  ShieldAlert,
} from "lucide-react";
import { ALL_FOLDERS_FILTER, type FolderSummary } from "@/lib/converters/workspaceHelpers";
import { AVAILABLE_TARGETS } from "@/lib/converters/registry";
import { formatOutputFilename } from "@/lib/utils/rename";
import type { ConversionRecipe } from "@/lib/workspace/recipes";
import type {
  ConversionJob,
  FileCategory,
  RenameSettings,
  SupportedFormat,
  ZipStructureMode,
} from "@/types/converter";

interface MassControlBarProps {
  jobs: readonly ConversionJob[];
  visibleJobsCount: number;
  folderSummaries: readonly FolderSummary[];
  folderFilter: string;
  onFolderFilterChange: (folder: string) => void;
  zipMode: ZipStructureMode;
  onZipModeChange: (mode: ZipStructureMode) => void;
  renameSettings: RenameSettings;
  onRenameChange: (next: RenameSettings) => void;
  recipes: readonly ConversionRecipe[];
  onApplyMassFormat: (format: SupportedFormat) => void;
  onApplyRecipe: (recipe: ConversionRecipe) => void;
  isConverting: boolean;
}

const RENAME_PRESETS: readonly { label: string; pattern: string }[] = [
  { label: "Original", pattern: "{name}" },
  { label: "Folder + Index", pattern: "{folder}_{name}_{index:3}" },
  { label: "Date + Seq", pattern: "{date}_{index:4}" },
  { label: "WxHDims", pattern: "{name}_{width}x{height}" },
];

export function MassControlBar({
  jobs,
  visibleJobsCount,
  folderSummaries,
  folderFilter,
  onFolderFilterChange,
  zipMode,
  onZipModeChange,
  renameSettings,
  onRenameChange,
  recipes,
  onApplyMassFormat,
  onApplyRecipe,
  isConverting,
}: MassControlBarProps) {
  const [showRenameDrawer, setShowRenameDrawer] = useState(false);

  const scopedJobs = useMemo(() => {
    if (folderFilter === ALL_FOLDERS_FILTER) return jobs;
    return jobs.filter((j) => (j.folderPath ?? "") === folderFilter);
  }, [jobs, folderFilter]);

  const categoriesInScope = useMemo(() => {
    const counts = new Map<FileCategory, number>();
    for (const j of scopedJobs) {
      counts.set(j.category, (counts.get(j.category) ?? 0) + 1);
    }
    return counts;
  }, [scopedJobs]);

  const primaryCategory: FileCategory = useMemo(() => {
    let best: FileCategory = "image";
    let bestCount = -1;
    for (const [cat, count] of categoriesInScope.entries()) {
      if (count > bestCount) {
        best = cat;
        bestCount = count;
      }
    }
    return best;
  }, [categoriesInScope]);

  const quickFormats = AVAILABLE_TARGETS[primaryCategory] ?? AVAILABLE_TARGETS.image;

  const hasGpsExif = useMemo(
    () => scopedJobs.some((j) => j.exifInfo?.hasGps),
    [scopedJobs]
  );

  const largePngCount = useMemo(
    () =>
      scopedJobs.filter(
        (j) => j.inputFormat === "png" && j.size > 250 * 1024 && j.targetFormat === "png"
      ).length,
    [scopedJobs]
  );

  const firstSampleJob = scopedJobs[0] ?? jobs[0];
  const renamePreview = firstSampleJob
    ? formatOutputFilename({
        originalName: firstSampleJob.name,
        targetFormat: firstSampleJob.targetFormat,
        index: renameSettings.startIndex ?? 1,
        folderPath: firstSampleJob.folderPath,
        width: firstSampleJob.sourceDimensions?.width ?? firstSampleJob.settings.width ?? 1920,
        height: firstSampleJob.sourceDimensions?.height ?? firstSampleJob.settings.height ?? 1080,
        settings: { ...renameSettings, enabled: true },
      })
    : "sample.webp";

  const hasFolders = folderSummaries.some((s) => s.folderPath !== "");

  return (
    <section
      data-testid="mass-control-bar"
      aria-label="Mass batch controls"
      className="w-full rounded-xl bg-[#111113] border border-[#c8f03c]/30 p-3.5 sm:p-4 space-y-3.5 shadow-[0_0_24px_rgba(200,240,60,0.06)] animate-fade-in"
    >
      {/* Top Row: Scope & Smart Advisories */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#c8f03c]">
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>MASS WORKBENCH ({visibleJobsCount}/{jobs.length})</span>
          </span>

          {hasGpsExif && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#2563eb]/15 border border-[#60a5fa]/35 font-mono text-[10px] text-[#60a5fa]">
              <ShieldAlert className="w-3 h-3" aria-hidden="true" />
              <span>GPS EXIF detected · auto-strip active</span>
            </span>
          )}

          {largePngCount > 0 && (
            <button
              type="button"
              disabled={isConverting}
              onClick={() => onApplyMassFormat("webp")}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#c8f03c]/10 border border-[#c8f03c]/35 font-mono text-[10px] text-[#c8f03c] hover:bg-[#c8f03c]/20 transition-colors"
            >
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              <span>Switch {largePngCount} heavy PNG{largePngCount > 1 ? "s" : ""} to WebP?</span>
            </button>
          )}
        </div>

        {/* ZIP Structure Toggle */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Archive folder structure">
          <FolderArchive className="w-3.5 h-3.5 text-[#9a9992]" aria-hidden="true" />
          <button
            type="button"
            disabled={isConverting}
            aria-pressed={zipMode === "preserve"}
            onClick={() => onZipModeChange("preserve")}
            className={`px-2 py-1 rounded font-mono text-[10px] font-semibold border transition-colors ${
              zipMode === "preserve"
                ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c]"
                : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
            }`}
          >
            Preserve Folders
          </button>
          <button
            type="button"
            disabled={isConverting}
            aria-pressed={zipMode === "flatten"}
            onClick={() => onZipModeChange("flatten")}
            className={`px-2 py-1 rounded font-mono text-[10px] font-semibold border transition-colors ${
              zipMode === "flatten"
                ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c]"
                : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
            }`}
          >
            Flatten Root
          </button>
        </div>
      </div>

      {/* Folder Scope Filter Pills (shown whenever nested folders exist) */}
      {hasFolders && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by folder">
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase text-[#8a8980] mr-1">
            <FolderTree className="w-3 h-3 text-[#60a5fa]" aria-hidden="true" />
            <span>Folder:</span>
          </span>
          <button
            type="button"
            aria-pressed={folderFilter === ALL_FOLDERS_FILTER}
            onClick={() => onFolderFilterChange(ALL_FOLDERS_FILTER)}
            className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition-colors ${
              folderFilter === ALL_FOLDERS_FILTER
                ? "bg-[#60a5fa]/20 border-[#60a5fa]/50 text-[#f0efe9] font-bold"
                : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
            }`}
          >
            All ({jobs.length})
          </button>
          {folderSummaries.map((summary) => {
            const active = folderFilter === summary.folderPath;
            return (
              <button
                key={summary.folderPath || "__root__"}
                type="button"
                aria-pressed={active}
                onClick={() => onFolderFilterChange(summary.folderPath)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition-colors ${
                  active
                    ? "bg-[#60a5fa]/20 border-[#60a5fa]/50 text-[#f0efe9] font-bold"
                    : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
                }`}
              >
                {summary.label} ({summary.count})
              </button>
            );
          })}
        </div>
      )}

      {/* Mass Format Selector + Recipes Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Convert all to format">
          <span className="font-mono text-[10px] uppercase text-[#8a8980] mr-1">
            Convert {folderFilter === ALL_FOLDERS_FILTER ? "All" : "Folder"} To:
          </span>
          {quickFormats.map((fmt) => (
            <button
              key={fmt}
              type="button"
              disabled={isConverting}
              onClick={() => onApplyMassFormat(fmt)}
              className="px-2.5 py-1 rounded-lg bg-[#18181b] hover:bg-[#c8f03c]/15 border border-white/[0.08] hover:border-[#c8f03c]/50 font-mono text-[11px] font-bold uppercase text-[#f0efe9] hover:text-[#c8f03c] transition-all active:scale-[0.97] disabled:opacity-40"
            >
              {fmt === "txt" ? "TXT (OCR)" : fmt}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase text-[#8a8980] mr-1">
            <Wand2 className="w-3 h-3 text-[#c8f03c]" aria-hidden="true" />
            <span>Recipes:</span>
          </span>
          {recipes
            .filter((r) => categoriesInScope.has(r.category))
            .slice(0, 4)
            .map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                disabled={isConverting}
                title={recipe.description}
                onClick={() => onApplyRecipe(recipe)}
                className="px-2.5 py-1 rounded-lg bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#60a5fa]/50 text-[11px] font-medium text-[#9a9992] hover:text-[#f0efe9] transition-colors disabled:opacity-40"
              >
                {recipe.name}
              </button>
            ))}

          <button
            type="button"
            onClick={() => setShowRenameDrawer((v) => !v)}
            aria-expanded={showRenameDrawer}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-colors ${
              renameSettings.enabled || showRenameDrawer
                ? "bg-[#c8f03c]/15 border-[#c8f03c]/45 text-[#c8f03c]"
                : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
            }`}
          >
            <Tag className="w-3 h-3" aria-hidden="true" />
            <span>Batch Rename</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform ${showRenameDrawer ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Collapsible Batch Rename Studio */}
      {showRenameDrawer && (
        <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-[#f0efe9] cursor-pointer">
              <input
                type="checkbox"
                checked={renameSettings.enabled}
                onChange={(e) =>
                  onRenameChange({ ...renameSettings, enabled: e.target.checked })
                }
                className="w-4 h-4 rounded bg-[#18181b] border-white/[0.15] text-[#c8f03c] focus:ring-0"
              />
              <span>Enable deterministic batch rename pattern</span>
            </label>

            <span className="font-mono text-[11px] text-[#9a9992]">
              Preview: <strong className="text-[#c8f03c]">{renamePreview}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label htmlFor="rename-pattern" className="block font-mono text-[10px] uppercase text-[#8a8980] mb-1">
                Pattern Tokens
              </label>
              <input
                id="rename-pattern"
                type="text"
                value={renameSettings.pattern}
                onChange={(e) =>
                  onRenameChange({ ...renameSettings, enabled: true, pattern: e.target.value })
                }
                placeholder="{folder}_{name}_{index:3}"
                className="w-full px-2.5 py-1.5 rounded bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="rename-prefix" className="block font-mono text-[10px] uppercase text-[#8a8980] mb-1">
                Prefix
              </label>
              <input
                id="rename-prefix"
                type="text"
                value={renameSettings.prefix ?? ""}
                onChange={(e) =>
                  onRenameChange({ ...renameSettings, enabled: true, prefix: e.target.value })
                }
                placeholder="web_"
                className="w-full px-2.5 py-1.5 rounded bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="rename-suffix" className="block font-mono text-[10px] uppercase text-[#8a8980] mb-1">
                Suffix
              </label>
              <input
                id="rename-suffix"
                type="text"
                value={renameSettings.suffix ?? ""}
                onChange={(e) =>
                  onRenameChange({ ...renameSettings, enabled: true, suffix: e.target.value })
                }
                placeholder="_min"
                className="w-full px-2.5 py-1.5 rounded bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <AlignLeft className="w-3 h-3 text-[#8a8980]" aria-hidden="true" />
            {RENAME_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  onRenameChange({ ...renameSettings, enabled: true, pattern: preset.pattern })
                }
                className="px-2 py-0.5 rounded bg-[#18181b] border border-white/[0.08] hover:border-[#c8f03c]/40 font-mono text-[10px] text-[#9a9992] hover:text-[#c8f03c]"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
