"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, ScanText, X } from "lucide-react";
import { triggerDownload } from "@/lib/utils/archive";
import type { ConversionJob } from "@/types/converter";

interface OcrResultModalProps {
  job: ConversionJob | null;
  onClose: () => void;
}

export function OcrResultModal({ job, onClose }: OcrResultModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
    if (!job) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job, onClose]);

  if (!job || typeof document === "undefined") return null;

  const text = job.ocrText ?? "";
  const baseName = job.name.replace(/\.[^/.]+$/, "");
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleCopy = async () => {
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    triggerDownload(blob, `${baseName}.txt`);
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
        aria-labelledby="ocr-modal-title"
        className="w-full max-w-2xl rounded-xl bg-[#111113] border border-white/[0.14] p-4 sm:p-6 shadow-2xl space-y-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#2563eb]/15 border border-[#60a5fa]/35 flex items-center justify-center text-[#60a5fa]">
              <ScanText className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="ocr-modal-title" className="font-display text-sm font-bold text-[#f0efe9] truncate">
                Extracted OCR Text // {job.name}
              </h3>
              <p className="font-mono text-[11px] text-[#9a9992] tabular-nums">
                {wordCount} words · {text.length} chars · Offline Tesseract WASM
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close OCR dialog"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9992] hover:text-[#f0efe9] hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <textarea
          readOnly
          aria-label="Extracted OCR text"
          value={text || "(No readable text detected in this file.)"}
          rows={12}
          className="w-full rounded-lg bg-[#0a0a0b] border border-white/[0.1] p-3 font-mono text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none resize-y"
        />

        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.12] text-[#f0efe9]"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#c8f03c]" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[#60a5fa]" aria-hidden="true" />
            )}
            <span>{copied ? "Copied" : "Copy Text"}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadTxt}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-[#0a0a0b] bg-[#c8f03c] hover:bg-[#b5dc30]"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download .txt</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
