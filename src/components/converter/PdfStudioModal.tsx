"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Loader2,
  RotateCw,
  Scissors,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  editPdfPages,
  renderPdfThumbnailsSequential,
  splitPdfByRanges,
  type PdfPageThumbnail,
} from "@/lib/converters/pdfTools";
import type { ConversionJob, OutputFile } from "@/types/converter";

interface PdfStudioModalProps {
  job: ConversionJob | null;
  onClose: () => void;
  onSaveOutputs: (jobId: string, outputs: OutputFile[]) => void;
}

interface EditablePageItem {
  id: string;
  pageNumber: number;
  sourcePageIndex: number;
  thumbnailUrl: string;
  rotateDeg: 0 | 90 | 180 | 270;
  included: boolean;
}

export function PdfStudioModal({ job, onClose, onSaveOutputs }: PdfStudioModalProps) {
  const [pages, setPages] = useState<EditablePageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [rangeExpr, setRangeExpr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const thumbUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    thumbUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    thumbUrlsRef.current = [];
    setPages([]);
    setRangeExpr("");
    setError(null);

    if (!job) return;

    let cancelled = false;
    setIsLoading(true);

    renderPdfThumbnailsSequential(job.file)
      .then((thumbs: PdfPageThumbnail[]) => {
        if (cancelled) {
          thumbs.forEach((t) => URL.revokeObjectURL(t.thumbnailUrl));
          return;
        }
        thumbUrlsRef.current = thumbs.map((t) => t.thumbnailUrl);
        setPages(
          thumbs.map((t) => ({
            id: `p-${t.sourcePageIndex}`,
            pageNumber: t.pageNumber,
            sourcePageIndex: t.sourcePageIndex,
            thumbnailUrl: t.thumbnailUrl,
            rotateDeg: 0,
            included: true,
          }))
        );
        if (thumbs.length >= 2) {
          const mid = Math.ceil(thumbs.length / 2);
          setRangeExpr(`1-${mid}, ${mid + 1}-${thumbs.length}`);
        } else {
          setRangeExpr("1");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to inspect PDF pages");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      thumbUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      thumbUrlsRef.current = [];
    };
  }, [job]);

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
  const activePages = pages.filter((p) => p.included);

  const movePage = (idx: number, delta: -1 | 1) => {
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= pages.length) return;
    setPages((prev) => {
      const copy = [...prev];
      const current = copy[idx];
      const target = copy[nextIdx];
      if (!current || !target) return prev;
      copy[idx] = target;
      copy[nextIdx] = current;
      return copy;
    });
  };

  const rotatePage = (id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotateDeg: (((p.rotateDeg + 90) % 360) as 0 | 90 | 180 | 270) } : p
      )
    );
  };

  const toggleInclude = (id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, included: !p.included } : p))
    );
  };

  const handleSaveEditedPdf = async () => {
    setError(null);
    setIsApplying(true);
    try {
      const ops = activePages.map((p) => ({
        sourcePageIndex: p.sourcePageIndex,
        rotateDeg: p.rotateDeg,
      }));
      const blob = await editPdfPages(job.file, ops);
      const output: OutputFile = {
        name: `${baseName}_edited.pdf`,
        blob,
        url: URL.createObjectURL(blob),
        size: blob.size,
      };
      onSaveOutputs(job.id, [output]);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save edited PDF");
    } finally {
      setIsApplying(false);
    }
  };

  const handleSplitRanges = async () => {
    setError(null);
    setIsApplying(true);
    try {
      const parts = await splitPdfByRanges(job.file, rangeExpr);
      const outputs: OutputFile[] = parts.map((p) => ({
        name: p.name,
        blob: p.blob,
        url: URL.createObjectURL(p.blob),
        size: p.blob.size,
      }));
      onSaveOutputs(job.id, outputs);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to split PDF");
    } finally {
      setIsApplying(false);
    }
  };

  const handleSplitIndividual = async () => {
    if (pages.length === 0) return;
    const allIndividualExpr = pages.map((p) => String(p.pageNumber)).join(", ");
    setRangeExpr(allIndividualExpr);
    setError(null);
    setIsApplying(true);
    try {
      const parts = await splitPdfByRanges(job.file, allIndividualExpr);
      const outputs: OutputFile[] = parts.map((p) => ({
        name: p.name,
        blob: p.blob,
        url: URL.createObjectURL(p.blob),
        size: p.blob.size,
      }));
      onSaveOutputs(job.id, outputs);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to burst PDF pages");
    } finally {
      setIsApplying(false);
    }
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
        aria-labelledby="pdf-studio-title"
        className="w-full max-w-4xl rounded-xl bg-[#111113] border border-white/[0.14] p-4 sm:p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/30 flex items-center justify-center text-[#c8f03c]">
              <FileText className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="pdf-studio-title" className="font-display text-sm font-bold text-[#f0efe9]">
                PDF Page Studio // {job.name}
              </h3>
              <p className="font-mono text-[11px] text-[#9a9992]">
                Reorder, rotate, remove, split ranges, or extract pages locally with pdf-lib
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close PDF studio"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9992] hover:text-[#f0efe9] hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Visual Page Grid */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center gap-2 text-xs font-mono text-[#c8f03c]">
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
            <span>Rendering PDF page thumbnails locally...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {pages.map((p, idx) => (
              <div
                key={p.id}
                className={`rounded-lg border p-2.5 space-y-2 transition-all ${
                  p.included
                    ? "bg-[#0a0a0b] border-white/[0.12]"
                    : "bg-[#0a0a0b]/50 border-white/[0.05] opacity-45"
                }`}
              >
                <div className="h-36 rounded bg-white/95 overflow-hidden flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumbnailUrl}
                    alt={`Page ${p.pageNumber}`}
                    style={{ transform: `rotate(${p.rotateDeg}deg)` }}
                    className="max-h-full max-w-full object-contain transition-transform"
                  />
                </div>

                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-[#f0efe9] font-bold">
                    #{idx + 1} (src p.{p.pageNumber})
                  </span>
                  {p.rotateDeg > 0 && <span className="text-[#c8f03c]">{p.rotateDeg}°</span>}
                </div>

                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => movePage(idx, -1)}
                    aria-label={`Move page ${p.pageNumber} left`}
                    className="p-1.5 rounded bg-[#18181b] border border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9] disabled:opacity-30"
                  >
                    <ArrowLeft className="w-3 h-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === pages.length - 1}
                    onClick={() => movePage(idx, 1)}
                    aria-label={`Move page ${p.pageNumber} right`}
                    className="p-1.5 rounded bg-[#18181b] border border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9] disabled:opacity-30"
                  >
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => rotatePage(p.id)}
                    aria-label={`Rotate page ${p.pageNumber}`}
                    className="p-1.5 rounded bg-[#18181b] border border-white/[0.08] text-[#9a9992] hover:text-[#c8f03c]"
                  >
                    <RotateCw className="w-3 h-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleInclude(p.id)}
                    aria-label={p.included ? `Exclude page ${p.pageNumber}` : `Restore page ${p.pageNumber}`}
                    className={`p-1.5 rounded border ${
                      p.included
                        ? "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f03c8c]"
                        : "bg-[#c8f03c]/15 border-[#c8f03c]/40 text-[#c8f03c]"
                    }`}
                  >
                    {p.included ? (
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <Check className="w-3 h-3" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Split by Range Controls */}
        <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="pdf-split-ranges" className="block font-mono text-[10px] uppercase text-[#8a8980] mb-1">
              Split by Page Ranges (e.g. 1-2, 3-4)
            </label>
            <input
              id="pdf-split-ranges"
              type="text"
              value={rangeExpr}
              onChange={(e) => setRangeExpr(e.target.value)}
              placeholder="1-2, 3-4"
              className="w-full px-3 py-1.5 rounded-lg bg-[#18181b] border border-white/[0.1] font-mono text-xs text-[#f0efe9] focus:border-[#c8f03c] focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={isApplying || pages.length === 0}
            onClick={handleSplitRanges}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.12] text-[#f0efe9] disabled:opacity-40"
          >
            <Scissors className="w-3.5 h-3.5 text-[#60a5fa]" aria-hidden="true" />
            <span>Split Ranges</span>
          </button>
          <button
            type="button"
            disabled={isApplying || pages.length === 0}
            onClick={handleSplitIndividual}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.12] text-[#f0efe9] disabled:opacity-40"
          >
            <span>Burst All ({pages.length} PDFs)</span>
          </button>
        </div>

        {error && (
          <p role="alert" className="text-xs font-mono text-[#f03c8c]">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
          <span className="font-mono text-[11px] text-[#9a9992]">
            {activePages.length} of {pages.length} pages selected
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-[#9a9992] hover:text-[#f0efe9]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isApplying || activePages.length === 0}
              onClick={handleSaveEditedPdf}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-[#0a0a0b] bg-[#c8f03c] hover:bg-[#b5dc30] disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Edited PDF ({activePages.length}p)</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
