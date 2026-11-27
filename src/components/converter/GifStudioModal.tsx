"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Film, Loader2, Play, RotateCcw, Sparkles, X, Download } from "lucide-react";
import { transcodeMediaWithInfo } from "@/lib/converters/mediaConverter";
import { triggerDownload } from "@/lib/utils/archive";
import type { ConversionJob, ConversionSettings, OutputFile } from "@/types/converter";

interface GifStudioModalProps {
  job: ConversionJob | null;
  onClose: () => void;
  onSaveOutput: (
    jobId: string,
    settings: ConversionSettings,
    output: OutputFile
  ) => void;
}

const FPS_OPTIONS = [5, 10, 12, 15, 24, 30] as const;
const WIDTH_OPTIONS = [320, 480, 640, 720] as const;

export function GifStudioModal({ job, onClose, onSaveOutput }: GifStudioModalProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(job?.durationSec ?? 0);
  const [fps, setFps] = useState<number>(job?.settings.fps ?? 12);
  const [width, setWidth] = useState<number>(job?.settings.width ?? 480);
  const [gifLoop, setGifLoop] = useState<number>(job?.settings.gifLoop ?? 0);
  const [reverseGif, setReverseGif] = useState<boolean>(Boolean(job?.settings.reverseGif));
  const [caption, setCaption] = useState<string>(job?.settings.gifCaption ?? "");
  const [trimStart, setTrimStart] = useState<number>(job?.settings.trimStart ?? 0);
  const [trimEnd, setTrimEnd] = useState<number>(job?.settings.trimEnd ?? (job?.durationSec ?? 0));

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!job) return;
    setFps(job.settings.fps ?? 12);
    setWidth(job.settings.width ?? 480);
    setGifLoop(job.settings.gifLoop ?? 0);
    setReverseGif(Boolean(job.settings.reverseGif));
    setCaption(job.settings.gifCaption ?? "");
    setTrimStart(job.settings.trimStart ?? 0);
    setTrimEnd(job.settings.trimEnd ?? job.durationSec ?? 0);
    setDuration(job.durationSec ?? 0);
    setError(null);
    setGeneratedBlob(null);

    const url = URL.createObjectURL(job.file);
    setVideoUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [job]);

  useEffect(() => {
    return () => {
      if (generatedUrl) {
        URL.revokeObjectURL(generatedUrl);
      }
    };
  }, [generatedUrl]);

  useEffect(() => {
    if (!job) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job, onClose]);

  if (!job || typeof document === "undefined") return null;

  const baseName = job.name.replace(/\.[^/.]+$/, "");
  const effectiveEnd = trimEnd > trimStart ? trimEnd : undefined;

  const buildCurrentSettings = (): ConversionSettings => ({
    ...job.settings,
    fps,
    width,
    height: null,
    gifLoop,
    reverseGif,
    gifCaption: caption.trim() || undefined,
    trimStart: trimStart > 0 ? trimStart : null,
    trimEnd: effectiveEnd ?? null,
  });

  const handleGeneratePreview = async () => {
    setError(null);
    setIsGenerating(true);
    setProgress(5);
    try {
      const nextSettings = buildCurrentSettings();
      const { blob } = await transcodeMediaWithInfo(job.file, "gif", nextSettings, setProgress);
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
      const url = URL.createObjectURL(blob);
      setGeneratedBlob(blob);
      setGeneratedUrl(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to render GIF");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyAndClose = () => {
    if (!generatedBlob || !generatedUrl) return;
    const nextUrl = URL.createObjectURL(generatedBlob);
    onSaveOutput(job.id, buildCurrentSettings(), {
      name: `${baseName}.gif`,
      blob: generatedBlob,
      url: nextUrl,
      size: generatedBlob.size,
    });
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gif-studio-title"
        className="w-full max-w-3xl rounded-xl bg-[#111113] border border-white/[0.14] p-4 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/30 flex items-center justify-center text-[#c8f03c]">
              <Film className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="gif-studio-title" className="font-display text-sm font-bold text-[#f0efe9]">
                Video-to-GIF Studio // {job.name}
              </h3>
              <p className="font-mono text-[11px] text-[#9a9992]">
                Two-pass palettegen · Client-side FFmpeg WASM · Zero uploads
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close GIF studio"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9992] hover:text-[#f0efe9] hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Media Stage: Video Scrubbing & Live GIF Preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-2.5 space-y-2">
            <span className="font-mono text-[10px] uppercase text-[#8a8980]">Source Clip</span>
            {videoUrl && (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                muted
                playsInline
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d) && d > 0) {
                    const rounded = Number(d.toFixed(2));
                    setDuration(rounded);
                    if (trimEnd <= 0 || trimEnd > rounded) {
                      setTrimEnd(rounded);
                    }
                  }
                }}
                className="w-full h-44 rounded bg-black object-contain"
              />
            )}
          </div>

          <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-2.5 space-y-2 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-[#8a8980]">Animated Preview</span>
              {generatedBlob && (
                <span className="font-mono text-[10px] font-bold text-[#c8f03c]">
                  {(generatedBlob.size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
            <div className="flex-1 min-h-[176px] rounded bg-black/60 flex items-center justify-center overflow-hidden">
              {isGenerating ? (
                <div className="flex flex-col items-center gap-2 text-xs font-mono text-[#c8f03c]">
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  <span>Rendering GIF ({progress}%)</span>
                </div>
              ) : generatedUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={generatedUrl}
                  alt="Generated animated GIF preview"
                  className="max-h-44 object-contain"
                />
              ) : (
                <span className="text-xs font-mono text-[#8a8980] px-4 text-center">
                  Configure trim &amp; FPS, then click Render Preview GIF
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Timeline Trim Range */}
        <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 space-y-2">
          <div className="flex items-center justify-between font-mono text-[11px] text-[#9a9992]">
            <span>TIMELINE TRIM (SECONDS)</span>
            <span className="text-[#c8f03c] tabular-nums">
              {trimStart.toFixed(1)}s → {(effectiveEnd ?? duration).toFixed(1)}s
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="gif-trim-start" className="block font-mono text-[10px] text-[#8a8980] mb-1">
                Start (s)
              </label>
              <input
                id="gif-trim-start"
                type="number"
                min={0}
                max={duration || undefined}
                step={0.1}
                value={trimStart}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  setTrimStart(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                className="w-full px-2.5 py-1.5 rounded bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="gif-trim-end" className="block font-mono text-[10px] text-[#8a8980] mb-1">
                End (s)
              </label>
              <input
                id="gif-trim-end"
                type="number"
                min={0}
                max={duration || undefined}
                step={0.1}
                value={trimEnd}
                onChange={(e) => setTrimEnd(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2.5 py-1.5 rounded bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* FPS, Width, Loop & Caption */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] uppercase text-[#8a8980]">Frame Rate (FPS)</span>
            <div className="flex flex-wrap gap-1">
              {FPS_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={fps === v}
                  onClick={() => setFps(v)}
                  className={`px-2 py-1 rounded font-mono text-[11px] border ${
                    fps === v
                      ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c] font-bold"
                      : "bg-[#18181b] border-white/[0.08] text-[#9a9992]"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block font-mono text-[10px] uppercase text-[#8a8980]">Output Width</span>
            <div className="flex flex-wrap gap-1">
              {WIDTH_OPTIONS.map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={width === w}
                  onClick={() => setWidth(w)}
                  className={`px-2 py-1 rounded font-mono text-[11px] border ${
                    width === w
                      ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c] font-bold"
                      : "bg-[#18181b] border-white/[0.08] text-[#9a9992]"
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="gif-loop-count" className="block font-mono text-[10px] uppercase text-[#8a8980]">
              Loop Count (0 = Infinite)
            </label>
            <input
              id="gif-loop-count"
              type="number"
              min={0}
              max={100}
              value={gifLoop}
              onChange={(e) => setGifLoop(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-2.5 py-1.5 rounded bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          <div className="sm:col-span-2">
            <label htmlFor="gif-caption" className="block font-mono text-[10px] uppercase text-[#8a8980] mb-1">
              Optional Caption Overlay
            </label>
            <input
              id="gif-caption"
              type="text"
              placeholder="Bottom meme/caption text..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[#18181b] border border-white/[0.1] text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none"
            />
          </div>

          <button
            type="button"
            aria-pressed={reverseGif}
            onClick={() => setReverseGif((v) => !v)}
            className={`mt-4 sm:mt-5 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border font-mono text-xs transition-colors ${
              reverseGif
                ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c] font-bold"
                : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reverse GIF</span>
          </button>
        </div>

        {error && (
          <p role="alert" className="text-xs text-[#f03c8c] font-mono">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-white/[0.06] pt-3">
          <button
            type="button"
            disabled={isGenerating}
            onClick={handleGeneratePreview}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#18181b] hover:bg-white/[0.08] border border-[#c8f03c]/40 text-[#c8f03c] disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            <span>Render Preview GIF</span>
          </button>

          {generatedBlob && (
            <>
              <button
                type="button"
                onClick={() => triggerDownload(generatedBlob, `${baseName}.gif`)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.12] text-[#f0efe9]"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Download GIF</span>
              </button>
              <button
                type="button"
                onClick={handleApplyAndClose}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-[#0a0a0b] bg-[#c8f03c] hover:bg-[#b5dc30]"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save to Queue</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
