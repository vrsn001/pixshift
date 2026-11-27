"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import NumberFlow from "@number-flow/react";
import {
  X,
  Sliders,
  Check,
  Lock,
  Unlock,
  Scissors,
  ShieldCheck,
  Cpu,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Gauge,
  Stamp,
  Crop,
  Sparkles,
} from "lucide-react";
import {
  ConversionSettings,
  FileCategory,
  SupportedFormat,
  VideoQualityPreset,
  WatermarkPosition,
} from "@/types/converter";
import { probeWebCodecsSupport } from "@/lib/converters/webcodecsMedia";
import { convertImageWithMeta } from "@/lib/converters/imageConverter";

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

const TARGET_KB_PRESETS = [100, 250, 500, 1024] as const;

const WATERMARK_POSITIONS: readonly { id: WatermarkPosition; label: string }[] = [
  { id: "top-left", label: "Top Left" },
  { id: "top-right", label: "Top Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-right", label: "Bottom Right" },
  { id: "center", label: "Center" },
  { id: "tile", label: "Tiled" },
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
    rotateDeg: initialSettings.rotateDeg ?? 0,
    flipH: initialSettings.flipH ?? false,
    flipV: initialSettings.flipV ?? false,
  });
  const [applyToAll, setApplyToAll] = useState(false);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(
    initialDimensions ?? null
  );
  const [mediaDuration, setMediaDuration] = useState<number | null>(initialDuration ?? null);
  const [webCodecsReady, setWebCodecsReady] = useState<boolean | null>(null);
  const [trimError, setTrimError] = useState<string | null>(null);

  // Live Smart Compression Dial telemetry & preview
  const [previewBytes, setPreviewBytes] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);
  const [advisorComparison, setAdvisorComparison] = useState<{
    format: string;
    bytes: number;
  } | null>(null);
  const previewUrlRef = useRef<string | null>(null);

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

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // Populate dimensions, video/audio duration, and WebCodecs capability badge
  useEffect(() => {
    let cancelled = false;

    if (category === "image" && !dims) {
      createImageBitmap(file)
        .then((bmp) => {
          if (!cancelled) setDims({ width: bmp.width, height: bmp.height });
          bmp.close();
        })
        .catch(() => {});
    }

    if (category === "video" || category === "audio") {
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
      }

      if (!mediaDuration || (category === "video" && !dims)) {
        const el = document.createElement(category === "video" ? "video" : "audio");
        const url = URL.createObjectURL(file);
        el.preload = "metadata";
        el.src = url;
        el.onloadedmetadata = () => {
          if (!cancelled) {
            if (Number.isFinite(el.duration) && el.duration > 0) {
              setMediaDuration(Number(el.duration.toFixed(2)));
            }
            if (el instanceof HTMLVideoElement && el.videoWidth > 0 && el.videoHeight > 0) {
              setDims({ width: el.videoWidth, height: el.videoHeight });
            }
          }
          URL.revokeObjectURL(url);
        };
        el.onerror = () => URL.revokeObjectURL(url);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [category, file, targetFormat, dims, mediaDuration, current.width, current.height]);

  // Debounced Smart Compression Dial live preview for images
  useEffect(() => {
    if (
      !isOpen ||
      category !== "image" ||
      targetFormat === "pdf" ||
      targetFormat === "txt" ||
      file.name.toLowerCase().endsWith(".heic") ||
      file.name.toLowerCase().endsWith(".heif")
    ) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await convertImageWithMeta(file, targetFormat, current);
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(res.blob);
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
        setPreviewBytes(res.blob.size);
        setPreviewWarning(res.targetUnreachableWarning ?? null);

        // Compare WebP vs current format when user is targeting jpeg/png/bmp
        if (targetFormat === "jpeg" || targetFormat === "png") {
          const webpProbe = await convertImageWithMeta(file, "webp", {
            ...current,
            targetSizeKb: null,
          });
          if (!cancelled && webpProbe.blob.size < res.blob.size * 0.85) {
            setAdvisorComparison({ format: "WEBP", bytes: webpProbe.blob.size });
          } else if (!cancelled) {
            setAdvisorComparison(null);
          }
        } else {
          setAdvisorComparison(null);
        }
      } catch {
        // Ignore transient probe errors (e.g. AVIF unsupported)
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, category, file, targetFormat, current]);

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

  const previewSavingsPct =
    previewBytes !== null && file.size > 0
      ? Math.round(((file.size - previewBytes) / file.size) * 100)
      : null;

  const wm = current.watermark ?? {
    enabled: false,
    mode: "text" as const,
    text: "PIXSHIFT",
    position: "bottom-right" as WatermarkPosition,
    opacity: 0.65,
    scale: 1,
    color: "#ffffff",
  };

  const crop = current.crop ?? null;

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
        className="w-full max-w-2xl rounded-xl bg-[#111113] border border-white/[0.14] p-4 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto animate-fade-in"
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
                Conversion &amp; Edit Studio
              </h3>
              <p className="text-xs text-[#9a9992] truncate max-w-[340px]">
                {fileName}
                {dims ? ` · ${dims.width}×${dims.height}` : ""}
                {mediaDuration ? ` · ${mediaDuration}s` : ""}
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

        {/* Live Smart Compression Preview Card (Images) */}
        {category === "image" && previewBytes !== null && (
          <div
            data-testid="smart-compression-preview"
            className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 flex flex-col sm:flex-row items-center gap-3.5"
          >
            {previewUrl && (
              <div className="w-20 h-16 rounded-md overflow-hidden border border-white/[0.1] bg-[#18181b] shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Live compressed preview"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                <span className="text-[#8a8980]">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <span className="text-[#8a8980]">→</span>
                <span className="text-[#c8f03c] font-bold">
                  <NumberFlow
                    value={Number((previewBytes / 1024).toFixed(1))}
                    suffix=" KB"
                    respectMotionPreference={true}
                  />
                </span>
                {previewSavingsPct !== null && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                      previewSavingsPct >= 0
                        ? "bg-[#c8f03c]/10 border-[#c8f03c]/40 text-[#c8f03c]"
                        : "bg-[#f03c8c]/10 border-[#f03c8c]/40 text-[#f03c8c]"
                    }`}
                  >
                    {previewSavingsPct >= 0
                      ? `-${previewSavingsPct}%`
                      : `+${Math.abs(previewSavingsPct)}%`}
                  </span>
                )}
              </div>
              {advisorComparison && (
                <p className="font-mono text-[10px] text-[#60a5fa] flex items-center gap-1">
                  <Sparkles className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>
                    Tip: {advisorComparison.format} estimates{" "}
                    {(advisorComparison.bytes / 1024).toFixed(1)} KB at this quality
                  </span>
                </p>
              )}
              {previewWarning && (
                <p className="font-mono text-[10px] text-[#f03c8c]">{previewWarning}</p>
              )}
            </div>
          </div>
        )}

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
          </div>
        )}

        {/* Trim Controls (Video & Audio) */}
        {(category === "video" || category === "audio") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#9a9992] flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-[#c8f03c]" aria-hidden="true" />
                <span>Trim Segment (seconds)</span>
              </span>
              {mediaDuration !== null && (
                <span className="font-mono text-[11px] text-[#8a8980] tabular-nums">
                  Duration: {mediaDuration}s
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
                  max={mediaDuration ?? undefined}
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
                  max={mediaDuration ?? undefined}
                  step={0.1}
                  placeholder={mediaDuration ? String(mediaDuration) : "End"}
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
        )}

        {/* Quality Dial + Target KB Auto-Compression (Images & Video) */}
        {(category === "image" || category === "video") && (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="quality-slider" className="font-medium text-[#9a9992]">
                  Output Quality
                </label>
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
                onChange={(e) =>
                  setCurrent({ ...current, quality: parseInt(e.target.value, 10) })
                }
                className="w-full h-1.5 bg-[#18181b] rounded-lg appearance-none cursor-pointer accent-[#c8f03c]"
              />
              <datalist id="quality-ticks">
                <option value={60} />
                <option value={80} />
                <option value={92} />
                <option value={100} />
              </datalist>
            </div>

            {category === "image" && (
              <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-[#f0efe9]">
                    <Gauge className="w-3.5 h-3.5 text-[#c8f03c]" aria-hidden="true" />
                    <span>Auto Target-Size Limit (KB)</span>
                  </span>
                  {current.targetSizeKb ? (
                    <button
                      type="button"
                      onClick={() => setCurrent({ ...current, targetSizeKb: null })}
                      className="font-mono text-[10px] text-[#9a9992] hover:text-[#f03c8c]"
                    >
                      Clear target
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {TARGET_KB_PRESETS.map((kb) => (
                    <button
                      key={kb}
                      type="button"
                      onClick={() => setCurrent({ ...current, targetSizeKb: kb })}
                      className={`px-2 py-1 rounded font-mono text-[10px] border transition-colors ${
                        current.targetSizeKb === kb
                          ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c] font-bold"
                          : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
                      }`}
                    >
                      {kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
                    </button>
                  ))}
                  <input
                    id="target-size-kb"
                    type="number"
                    min={1}
                    max={51200}
                    aria-label="Custom target size KB"
                    placeholder="Custom KB"
                    value={current.targetSizeKb ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value, 10) : null;
                      setCurrent({
                        ...current,
                        targetSizeKb: val && val > 0 ? val : null,
                      });
                    }}
                    className="w-24 px-2 py-1 rounded bg-[#18181b] border border-white/[0.1] font-mono text-[11px] text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none tabular-nums"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Geometry & Watermark Tools (Images) */}
        {category === "image" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Rotate, Flip & Crop */}
            <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-[#f0efe9]">
                  <Crop className="w-3.5 h-3.5 text-[#60a5fa]" aria-hidden="true" />
                  <span>Rotate, Flip &amp; Crop</span>
                </span>
                <span className="font-mono text-[10px] text-[#8a8980]">
                  {current.rotateDeg ?? 0}°
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setCurrent({
                      ...current,
                      rotateDeg: ((((current.rotateDeg ?? 0) + 90) % 360) as 0 | 90 | 180 | 270),
                    })
                  }
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-[#18181b] border border-white/[0.08] hover:border-[#c8f03c]/40 font-mono text-[10px] text-[#f0efe9]"
                >
                  <RotateCw className="w-3 h-3" aria-hidden="true" />
                  <span>+90°</span>
                </button>
                <button
                  type="button"
                  aria-pressed={Boolean(current.flipH)}
                  onClick={() => setCurrent({ ...current, flipH: !current.flipH })}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border font-mono text-[10px] ${
                    current.flipH
                      ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c]"
                      : "bg-[#18181b] border-white/[0.08] text-[#9a9992]"
                  }`}
                >
                  <FlipHorizontal className="w-3 h-3" aria-hidden="true" />
                  <span>Flip H</span>
                </button>
                <button
                  type="button"
                  aria-pressed={Boolean(current.flipV)}
                  onClick={() => setCurrent({ ...current, flipV: !current.flipV })}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border font-mono text-[10px] ${
                    current.flipV
                      ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c]"
                      : "bg-[#18181b] border-white/[0.08] text-[#9a9992]"
                  }`}
                >
                  <FlipVertical className="w-3 h-3" aria-hidden="true" />
                  <span>Flip V</span>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {(["x", "y", "width", "height"] as const).map((field) => (
                  <div key={field}>
                    <label className="block font-mono text-[9px] uppercase text-[#8a8980]">
                      {field}%
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder={field === "width" || field === "height" ? "100" : "0"}
                      value={crop?.[field] ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "" && field === "width") {
                          setCurrent({ ...current, crop: null });
                          return;
                        }
                        const num = Math.max(0, Math.min(100, Number(raw) || 0));
                        const baseCrop = crop ?? { x: 0, y: 0, width: 100, height: 100, unit: "percent" as const };
                        setCurrent({
                          ...current,
                          crop: { ...baseCrop, [field]: num, unit: "percent" },
                        });
                      }}
                      className="w-full px-1.5 py-1 rounded bg-[#18181b] border border-white/[0.1] font-mono text-[11px] text-[#f0efe9] tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Watermark Overlay */}
            <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 space-y-2">
              <label className="flex items-center justify-between cursor-pointer text-xs text-[#f0efe9]">
                <span className="flex items-center gap-1.5 font-medium">
                  <Stamp className="w-3.5 h-3.5 text-[#c8f03c]" aria-hidden="true" />
                  <span>Watermark Stamp</span>
                </span>
                <input
                  type="checkbox"
                  checked={wm.enabled}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      watermark: { ...wm, enabled: e.target.checked },
                    })
                  }
                  className="w-4 h-4 rounded bg-[#18181b] border-white/[0.15] text-[#c8f03c] focus:ring-0"
                />
              </label>

              <input
                type="text"
                aria-label="Watermark text"
                placeholder="Watermark text (e.g. © Pixshift)"
                value={wm.text ?? ""}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    watermark: { ...wm, enabled: true, mode: "text", text: e.target.value },
                  })
                }
                className="w-full px-2.5 py-1 rounded bg-[#18181b] border border-white/[0.1] font-mono text-[11px] text-[#f0efe9]"
              />

              <div className="grid grid-cols-2 gap-1.5">
                <select
                  aria-label="Watermark position"
                  value={wm.position}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      watermark: { ...wm, position: e.target.value as WatermarkPosition },
                    })
                  }
                  className="px-2 py-1 rounded bg-[#18181b] border border-white/[0.1] font-mono text-[10px] text-[#f0efe9]"
                >
                  {WATERMARK_POSITIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={10}
                  max={100}
                  aria-label="Watermark opacity %"
                  value={Math.round((wm.opacity ?? 0.65) * 100)}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      watermark: {
                        ...wm,
                        opacity: Math.max(0.1, Math.min(1, (Number(e.target.value) || 65) / 100)),
                      },
                    })
                  }
                  className="px-2 py-1 rounded bg-[#18181b] border border-white/[0.1] font-mono text-[10px] text-[#f0efe9]"
                />
              </div>
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

        {/* Audio Bitrate */}
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
