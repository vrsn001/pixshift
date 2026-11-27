"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoveHorizontal, X } from "lucide-react";
import type { ConversionJob } from "@/types/converter";

interface VisualDiffModalProps {
  job: ConversionJob | null;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function VisualDiffModal({ job, onClose }: VisualDiffModalProps) {
  const [splitPct, setSplitPct] = useState(50);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const output = job?.outputFiles?.[0];
  const isHeicInput =
    job !== null && ["heic", "heif"].includes(job.inputFormat.toLowerCase());

  useEffect(() => {
    setSplitPct(50);
    if (!job || isHeicInput) {
      setOriginalUrl(null);
      return;
    }
    const url = URL.createObjectURL(job.file);
    setOriginalUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [job, isHeicInput]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (job) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [job, handleKeyDown]);

  const updateSplitFromClientX = useCallback((clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const rawPct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.max(0, Math.min(100, Math.round(rawPct))));
  }, []);

  if (!job || !output || typeof document === "undefined") return null;

  const deltaBytes = job.size - output.size;
  const deltaPct = job.size > 0 ? Math.round((deltaBytes / job.size) * 100) : 0;
  const saved = deltaBytes >= 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="diff-modal-title"
        className="w-full max-w-3xl rounded-xl bg-[#111113] border border-white/[0.14] p-4 sm:p-6 shadow-2xl space-y-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="min-w-0">
            <h3 id="diff-modal-title" className="font-display text-sm font-bold text-[#f0efe9] truncate">
              Visual Diff // {job.name}
            </h3>
            <p className="font-mono text-[11px] text-[#9a9992] tabular-nums mt-0.5">
              {job.inputFormat.toUpperCase()} ({formatBytes(job.size)}) → {job.targetFormat.toUpperCase()} ({formatBytes(output.size)})
              <span className={`ml-2 font-bold ${saved ? "text-[#c8f03c]" : "text-[#f03c8c]"}`}>
                {saved ? `-${Math.abs(deltaPct)}%` : `+${Math.abs(deltaPct)}%`}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close visual comparison"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9992] hover:text-[#f0efe9] hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Comparison Viewport */}
        {isHeicInput || !originalUrl ? (
          <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-6 text-center space-y-3">
            <p className="text-xs text-[#9a9992]">
              Original HEIC preview is not natively renderable by this browser; showing converted output below.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={output.url}
              alt={`Converted ${output.name}`}
              className="max-h-[420px] mx-auto rounded object-contain"
            />
          </div>
        ) : (
          <div
            ref={stageRef}
            onPointerDown={(e) => {
              isDraggingRef.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              updateSplitFromClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (isDraggingRef.current) {
                updateSplitFromClientX(e.clientX);
              }
            }}
            onPointerUp={() => {
              isDraggingRef.current = false;
            }}
            className="relative w-full h-[360px] sm:h-[420px] rounded-lg overflow-hidden border border-white/[0.1] bg-[#0a0a0b] select-none touch-none cursor-ew-resize"
          >
            {/* After (Right / Full background) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={output.url}
              alt={`Converted ${job.targetFormat.toUpperCase()}`}
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* Before (Left / Clipped overlay) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalUrl}
              alt={`Original ${job.inputFormat.toUpperCase()}`}
              draggable={false}
              style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none bg-[#0a0a0b]"
            />

            {/* Labels */}
            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-[#0a0a0b]/85 border border-white/[0.12] font-mono text-[10px] font-bold text-[#f0efe9] pointer-events-none">
              BEFORE // {job.inputFormat.toUpperCase()}
            </div>
            <div className="absolute top-3 right-3 px-2 py-1 rounded bg-[#0a0a0b]/85 border border-[#c8f03c]/40 font-mono text-[10px] font-bold text-[#c8f03c] pointer-events-none">
              AFTER // {job.targetFormat.toUpperCase()}
            </div>

            {/* Slider Line + Focusable Handle */}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Comparison split position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={splitPct}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 10 : 1;
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setSplitPct((v) => Math.max(0, v - step));
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setSplitPct((v) => Math.min(100, v + step));
                } else if (e.key === "Home") {
                  e.preventDefault();
                  setSplitPct(0);
                } else if (e.key === "End") {
                  e.preventDefault();
                  setSplitPct(100);
                }
              }}
              style={{ left: `${splitPct}%` }}
              className="absolute top-0 bottom-0 -translate-x-1/2 w-6 flex items-center justify-center focus:outline-none group"
            >
              <div className="w-[1px] h-full bg-[#c8f03c] shadow-[0_0_12px_rgba(200,240,60,0.8)]" />
              <div className="absolute w-8 h-8 rounded-full bg-[#111113] border-2 border-[#c8f03c] flex items-center justify-center text-[#c8f03c] shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-white">
                <MoveHorizontal className="w-4 h-4" aria-hidden="true" />
              </div>
            </div>
          </div>
        )}

        {/* Footer Telemetry */}
        <div className="flex items-center justify-between text-[11px] font-mono text-[#9a9992] pt-1">
          <span>Drag handle or press ← / → arrow keys (Shift for 10%)</span>
          <span className="tabular-nums text-[#c8f03c]">SPLIT: {splitPct}%</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
