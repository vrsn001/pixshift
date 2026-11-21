"use client";

import React, { useState } from "react";
import { X, Sliders, Check, Lock, Unlock } from "lucide-react";
import { ConversionSettings, FileCategory } from "@/types/converter";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  category: FileCategory;
  settings: ConversionSettings;
  onSave: (settings: ConversionSettings, applyToAll: boolean) => void;
}

const RESOLUTION_PRESETS = [
  { label: "Original", sub: "Keep size", w: null, h: null },
  { label: "720p", sub: "1280×720", w: 1280, h: 720 },
  { label: "1080p", sub: "1920×1080", w: 1920, h: 1080 },
  { label: "1440p", sub: "2560×1440", w: 2560, h: 1440 },
  { label: "4K UHD", sub: "3840×2160", w: 3840, h: 2160 },
];

export function SettingsModal({
  isOpen,
  onClose,
  fileName,
  category,
  settings: initialSettings,
  onSave,
}: SettingsModalProps) {
  const [current, setCurrent] = useState<ConversionSettings>({ ...initialSettings });
  const [applyToAll, setApplyToAll] = useState(false);

  if (!isOpen) return null;

  const getQualityLabel = (val: number) => {
    if (val >= 98) return "Lossless";
    if (val >= 90) return "Near Lossless";
    if (val >= 80) return "High Quality";
    if (val >= 60) return "Web Optimized";
    if (val >= 40) return "Medium";
    return "Compressed / Low";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md rounded-2xl bg-[#111113] border border-white/[0.12] p-4 sm:p-6 shadow-2xl space-y-5 sm:space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/30 flex items-center justify-center text-[#c8f03c]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-[#f0efe9]">Conversion Settings</h3>
              <p className="text-xs text-[#9a9992] truncate max-w-[240px]">{fileName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9992] hover:text-[#f0efe9] hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quality Slider (Images & Video) */}
        {(category === "image" || category === "video") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#9a9992]">Output Quality</span>
              <span className="font-semibold text-[#c8f03c]">
                {current.quality}% — {getQualityLabel(current.quality)}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={1}
              value={current.quality}
              onChange={(e) => setCurrent({ ...current, quality: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-[#18181b] rounded-lg appearance-none cursor-pointer accent-[#c8f03c]"
            />
            <div className="flex justify-between text-[10px] text-[#5a5952]">
              <span>Compressed (10%)</span>
              <span>Lossless (100%)</span>
            </div>
          </div>
        )}

        {/* Resolution Presets */}
        {(category === "image" || category === "video") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#9a9992]">Resolution Preset</span>
              <button
                type="button"
                onClick={() =>
                  setCurrent({ ...current, maintainAspectRatio: !current.maintainAspectRatio })
                }
                className="flex items-center gap-1 text-[11px] text-[#9a9992] hover:text-[#c8f03c] transition-colors"
              >
                {current.maintainAspectRatio ? <Lock className="w-3 h-3 text-[#c8f03c]" /> : <Unlock className="w-3 h-3 text-[#5a5952]" />}
                <span>{current.maintainAspectRatio ? "Keep Aspect Ratio" : "Free Scale"}</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {RESOLUTION_PRESETS.map((p) => {
                const isActive = current.width === p.w && current.height === p.h;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setCurrent({ ...current, width: p.w, height: p.h })}
                    className={`px-2.5 py-2 rounded-xl text-left border transition-all ${
                      isActive
                        ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c]"
                        : "bg-[#18181b] border-white/[0.06] text-[#9a9992] hover:bg-[#18181b]/80 hover:text-[#f0efe9]"
                    }`}
                  >
                    <div className="text-xs font-bold font-display">{p.label}</div>
                    <div className="text-[10px] opacity-70 truncate">{p.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Audio Bitrate (Video & Audio) */}
        {(category === "video" || category === "audio") && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-[#9a9992] block">Audio Bitrate</span>
            <div className="grid grid-cols-4 gap-2">
              {(["96k", "128k", "192k", "320k"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setCurrent({ ...current, audioBitrate: b })}
                  className={`py-1.5 rounded-lg text-xs font-medium border text-center transition-all ${
                    current.audioBitrate === b
                      ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c] font-bold"
                      : "bg-[#18181b] border-white/[0.06] text-[#9a9992] hover:text-[#f0efe9]"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Apply to all check */}
        <div className="pt-2 border-t border-white/[0.06]">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-[#9a9992] hover:text-[#f0efe9]">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="w-4 h-4 rounded bg-[#18181b] border-white/[0.1] text-[#c8f03c] focus:ring-0 cursor-pointer"
            />
            <span>Apply to all {category} files in queue</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-[#9a9992] hover:text-[#f0efe9] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(current, applyToAll);
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-[#0a0a0b] bg-[#c8f03c] hover:bg-[#b5dc30] transition-colors shadow-lg shadow-[#c8f03c]/20"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
