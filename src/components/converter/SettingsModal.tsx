"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Sliders, Check, Lock, Unlock, Scissors, ShieldCheck, Cpu } from "lucide-react";
import {
  ConversionSettings,
  FileCategory,
  SupportedFormat,
  VideoQualityPreset,
} from "@/types/converter";
import { probeWebCodecsSupport } from "@/lib/converters/webcodecsMedia";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: File;
  fileName: string;
  category: FileCategory;
  targetFormat: SupportedFormat;
  sourceDimensions?: { width: number; height: number } | null;
  durationSec?: number | null;
  settings: ConversionSettings;
  onSave: (settings: ConversionSettings, applyToAll: boolean) => void;
}

export const RESOLUTION_PRESETS: { label: string; sub: string; w: number | null; h: number | null }[] = [
  { label: "Original", sub: "keep as-is", w: null, h: null },
  { label: "320×240", sub: "QVGA", w: 320, h: 240 },
  { label: "480p", sub: "854×480", w: 854, h: 480 },
  { label: "640×480", sub: "VGA", w: 640, h: 480 },
  { label: "720p", sub: "1280×720", w: 1280, h: 720 },
  { label: "800×600", sub: "SVGA", w: 800, h: 600 },
  { label: "1080p", sub: "1920×1080", w: 1920, h: 1080 },
  { label: "1440p", sub: "2560×1440", w: 2560, h: 1440 },
  { label: "2048p", sub: "2048×1536", w: 2048, h: 1536 },
  { label: "4K UHD", sub: "3840×2160", w: 3840, h: 2160 },
];

export function SettingsModal({
  isOpen,
  onClose,
  file,
  fileName,
  category,
  targetFormat,
  sourceDimensions: initialDimensions,
  durationSec: initialDuration,
  settings: initialSettings,
  onSave,
}: SettingsModalProps) {
  const [current, setCurrent] = useState<ConversionSettings>({
    ...initialSettings,
    stripExif: initialSettings.stripExif !== false,
    videoQualityPreset: initialSettings.videoQualityPreset ?? "balanced",
  });
  const [applyToAll, setApplyToAll] = useState(false);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(
    initialDimensions ?? null
  );
  const [videoDuration, setVideoDuration] = useState<number | null>(initialDuration ?? null);
  const [webCodecsReady, setWebCodecsReady] = useState<boolean | null>(null);
  const [trimError, setTrimError] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Ensure image dimensions & video metadata/capability badge are populated even if opened immediately
  useEffect(() => {
    let cancelled = false;

    if (category === "image" && !dims) {
      createImageBitmap(file)
        .then((bmp) => {
          if (!cancelled) {
            setDims({ width: bmp.width, height: bmp.height });
          }
          bmp.close();
        })
        .catch(() => {
          // Non-native image format (e.g. HEIC)
        });
    }

    if (category === "video") {
      probeWebCodecsSupport(targetFormat, {
        width: current.width,
        height: current.height,
      })
        .then((ok) => {
          if (!cancelled) setWebCodecsReady(ok);
        })
        .catch(() => {
          if (!cancelled) setWebCodecsReady(false);
        });

      if (!videoDuration || !dims) {
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);
        video.preload = "metadata";
        video.src = url;
        video.onloadedmetadata = () => {
          if (!cancelled) {
            if (Number.isFinite(video.duration) && video.duration > 0) {
              setVideoDuration(Number(video.duration.toFixed(2)));
            }
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              setDims({ width: video.videoWidth, height: video.videoHeight });
            }
          }
          URL.revokeObjectURL(url);
        };
        video.onerror = () => {
          URL.revokeObjectURL(url);
        };
      }
    }

    return () => {
      cancelled = true;
    };
  }, [category, file, targetFormat, dims, videoDuration, current.width, current.height]);

  if (!isOpen || typeof document === "undefined") return null;

  const getQualityLabel = (val: number) => {
    if (val >= 98) return "Lossless";
    if (val >= 90) return "Near Lossless";
    if (val >= 80) return "High Quality";
    if (val >= 60) return "Web Optimised";
    if (val >= 40) return "Medium";
    return "Compressed / Low";
  };

  const handleWidthChange = (rawValue: string) => {
    if (rawValue === "") {
      setCurrent({ ...current, width: null, height: current.maintainAspectRatio ? null : current.height });
      return;
    }
    const parsed = parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    const clampedW = Math.min(16384, parsed);

    if (current.maintainAspectRatio && dims && dims.width > 0 && dims.height > 0) {
      const ratio = dims.height / dims.width;
      setCurrent({
        ...current,
        width: clampedW,
        height: Math.max(1, Math.round(clampedW * ratio)),
      });
    } else {
      setCurrent({ ...current, width: clampedW });
    }
  };

  const handleHeightChange = (rawValue: string) => {
    if (rawValue === "") {
      setCurrent({ ...current, height: null, width: current.maintainAspectRatio ? null : current.width });
      return;
    }
    const parsed = parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    const clampedH = Math.min(16384, parsed);

    if (current.maintainAspectRatio && dims && dims.width > 0 && dims.height > 0) {
      const ratio = dims.width / dims.height;
      setCurrent({
        ...current,
        width: Math.max(1, Math.round(clampedH * ratio)),
        height: clampedH,
      });
    } else {
      setCurrent({ ...current, height: clampedH });
    }
  };

  const handleTrimChange = (field: "trimStart" | "trimEnd", rawValue: string) => {
    setTrimError(null);
    if (rawValue === "") {
      setCurrent({ ...current, [field]: null });
      return;
    }
    const num = parseFloat(rawValue);
    if (!Number.isFinite(num) || num < 0) {
      setTrimError("Trim times must be non-negative numbers.");
      return;
    }
    const updated = { ...current, [field]: num };
    if (
      updated.trimStart !== null &&
      updated.trimStart !== undefined &&
      updated.trimEnd !== null &&
      updated.trimEnd !== undefined &&
      updated.trimEnd <= updated.trimStart
    ) {
      setTrimError("Trim end must be greater than trim start.");
    }
    setCurrent(updated);
  };

  const handleAttemptSave = () => {
    if (
      current.trimStart !== null &&
      current.trimStart !== undefined &&
      current.trimEnd !== null &&
      current.trimEnd !== undefined &&
      current.trimEnd <= current.trimStart
    ) {
      setTrimError("Trim end must be greater than trim start.");
      return;
    }
    onSave(current, applyToAll);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="w-full max-w-lg rounded-xl bg-[#111113] border border-white/[0.14] p-4 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/30 flex items-center justify-center text-[#c8f03c]" aria-hidden="true">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="settings-modal-title" className="font-display text-sm font-bold text-[#f0efe9]">
                Conversion Settings
              </h3>
              <p className="text-xs text-[#9a9992] truncate max-w-[260px]">
                {fileName}
                {dims ? ` · ${dims.width}×${dims.height}` : ""}
                {videoDuration ? ` · ${videoDuration}s` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9992] hover:text-[#f0efe9] hover:bg-white/[0.06] transition-colors active:scale-[0.98]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Video Engine Badge & Compression Preset */}
        {category === "video" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0a0a0b] border border-white/[0.08]">
              <div className="flex items-center gap-2 text-xs text-[#9a9992]">
                <Cpu className="w-3.5 h-3.5 text-[#60a5fa]" aria-hidden="true" />
                <span>Media Engine</span>
              </div>
              <span
                data-testid="video-engine-badge"
                className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
                  webCodecsReady
                    ? "bg-[#2563eb]/20 border-[#60a5fa]/40 text-[#60a5fa]"
                    : "bg-white/[0.05] border-white/[0.14] text-[#9a9992]"
                }`}
              >
                {webCodecsReady ? "WEBCODECS HW" : "FFMPEG WASM"}
              </span>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-[#9a9992] block">Compression Preset</span>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Video compression preset">
                {(
                  [
                    { id: "high", label: "High", sub: "5 Mbps / CRF 20" },
                    { id: "balanced", label: "Balanced", sub: "2.5 Mbps / CRF 26" },
                    { id: "compact", label: "Compact", sub: "1 Mbps / CRF 32" },
                  ] as const satisfies readonly { id: VideoQualityPreset; label: string; sub: string }[]
                ).map((preset) => {
                  const isActive = (current.videoQualityPreset ?? "balanced") === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setCurrent({ ...current, videoQualityPreset: preset.id })}
                      className={`py-2 px-2 rounded-lg text-center border transition-all active:scale-[0.98] ${
                        isActive
                          ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c]"
                          : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
                      }`}
                    >
                      <div className="text-xs font-bold font-display">{preset.label}</div>
                      <div className="text-[10px] font-mono opacity-80">{preset.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Video Trim Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#9a9992] flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-[#c8f03c]" aria-hidden="true" />
                  <span>Trim Segment (seconds)</span>
                </span>
                {videoDuration !== null && (
                  <span className="font-mono text-[11px] text-[#8a8980] tabular-nums">
                    Duration: {videoDuration}s
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="trim-start" className="block font-mono text-[10px] uppercase text-[#8a8980] mb-1">
                    Trim Start (s)
                  </label>
                  <input
                    id="trim-start"
                    type="number"
                    min={0}
                    max={videoDuration ?? undefined}
                    step={0.1}
                    placeholder="0.0"
                    value={current.trimStart ?? ""}
                    onChange={(e) => handleTrimChange("trimStart", e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="trim-end" className="block font-mono text-[10px] uppercase text-[#8a8980] mb-1">
                    Trim End (s)
                  </label>
                  <input
                    id="trim-end"
                    type="number"
                    min={0}
                    max={videoDuration ?? undefined}
                    step={0.1}
                    placeholder={videoDuration ? String(videoDuration) : "End"}
                    value={current.trimEnd ?? ""}
                    onChange={(e) => handleTrimChange("trimEnd", e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none tabular-nums"
                  />
                </div>
              </div>
              {trimError && (
                <p role="alert" className="text-[11px] font-medium text-[#f03c8c]">
                  {trimError}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Quality Slider (Images & Video) */}
        {(category === "image" || category === "video") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="quality-slider" className="font-medium text-[#9a9992]">Output Quality</label>
              <span className="font-mono font-semibold text-[#c8f03c] tabular-nums">
                {current.quality}% — {getQualityLabel(current.quality)}
              </span>
            </div>
            <input
              id="quality-slider"
              type="range"
              min={10}
              max={100}
              step={1}
              list="quality-ticks"
              value={current.quality}
              onChange={(e) => setCurrent({ ...current, quality: parseInt(e.target.value, 10) })}
              className="w-full h-1.5 bg-[#18181b] rounded-lg appearance-none cursor-pointer accent-[#c8f03c]"
            />
            <datalist id="quality-ticks">
              <option value={60} />
              <option value={80} />
              <option value={92} />
              <option value={100} />
            </datalist>
            <div className="flex justify-between font-mono text-[10px] text-[#8a8980]">
              <span>10%</span>
              <span>60%</span>
              <span>80%</span>
              <span>92%</span>
              <span>100%</span>
            </div>
          </div>
        )}

        {/* Resolution Presets + Custom W/H */}
        {(category === "image" || category === "video") && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#9a9992]">Resolution &amp; Dimensions</span>
              <button
                type="button"
                onClick={() =>
                  setCurrent({ ...current, maintainAspectRatio: !current.maintainAspectRatio })
                }
                className="flex items-center gap-1 text-[11px] text-[#9a9992] hover:text-[#c8f03c] transition-colors active:scale-[0.98]"
              >
                {current.maintainAspectRatio ? (
                  <Lock className="w-3 h-3 text-[#c8f03c]" aria-hidden="true" />
                ) : (
                  <Unlock className="w-3 h-3 text-[#8a8980]" aria-hidden="true" />
                )}
                <span>{current.maintainAspectRatio ? "Keep Aspect Ratio" : "Free Scale"}</span>
              </button>
            </div>

            {/* 10 Legacy Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {RESOLUTION_PRESETS.map((p) => {
                const isActive = current.width === p.w && current.height === p.h;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setCurrent({ ...current, width: p.w, height: p.h })}
                    aria-pressed={isActive}
                    className={`py-1.5 px-1.5 rounded-lg text-center border transition-all active:scale-[0.98] ${
                      isActive
                        ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c]"
                        : "bg-[#18181b] border-white/[0.06] text-[#9a9992] hover:bg-[#18181b]/80 hover:text-[#f0efe9]"
                    }`}
                  >
                    <div className="text-[11px] font-bold font-display">{p.label}</div>
                    <div className="text-[9px] font-mono opacity-80 truncate">{p.sub}</div>
                  </button>
                );
              })}
            </div>

            {/* Custom W x H */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="custom-width" className="block font-mono text-[10px] uppercase text-[#8a8980] mb-1">
                  Width (px)
                </label>
                <input
                  id="custom-width"
                  type="number"
                  min={1}
                  max={16384}
                  placeholder={dims ? String(dims.width) : "Auto"}
                  value={current.width ?? ""}
                  onChange={(e) => handleWidthChange(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="custom-height" className="block font-mono text-[10px] uppercase text-[#8a8980] mb-1">
                  Height (px)
                </label>
                <input
                  id="custom-height"
                  type="number"
                  min={1}
                  max={16384}
                  placeholder={dims ? String(dims.height) : "Auto"}
                  value={current.height ?? ""}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none tabular-nums"
                />
              </div>
            </div>
          </div>
        )}

        {/* Image EXIF Stripper Toggle */}
        {category === "image" && (
          <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 space-y-1.5">
            <label className="flex items-center justify-between cursor-pointer text-xs text-[#f0efe9]">
              <span className="flex items-center gap-2 font-medium">
                <ShieldCheck className="w-4 h-4 text-[#c8f03c]" aria-hidden="true" />
                <span>Strip EXIF metadata</span>
              </span>
              <input
                type="checkbox"
                checked={current.stripExif !== false}
                onChange={(e) => setCurrent({ ...current, stripExif: e.target.checked })}
                className="w-4 h-4 rounded bg-[#18181b] border-white/[0.15] text-[#c8f03c] focus:ring-0 cursor-pointer"
              />
            </label>
            <p className="text-[10px] text-[#8a8980] leading-relaxed">
              Removes camera, GPS, and XMP tags. Note: format conversion or resizing via Canvas always removes EXIF metadata.
            </p>
          </div>
        )}

        {/* Audio Bitrate (Video & Audio) */}
        {(category === "video" || category === "audio") && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-[#9a9992] block">Audio Bitrate</span>
            <div className="grid grid-cols-5 gap-2" role="group" aria-label="Audio bitrate">
              {(["96k", "128k", "192k", "256k", "320k"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setCurrent({ ...current, audioBitrate: b })}
                  aria-pressed={current.audioBitrate === b}
                  className={`py-1.5 rounded-lg text-xs font-mono border text-center transition-all active:scale-[0.98] ${
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

        {/* Apply to all */}
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
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-[#9a9992] hover:text-[#f0efe9] transition-colors active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={Boolean(trimError)}
            onClick={handleAttemptSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-[#0a0a0b] bg-[#c8f03c] hover:bg-[#b5dc30] transition-colors shadow-lg shadow-[#c8f03c]/20 disabled:opacity-40 active:scale-[0.98]"
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
