"use client";

import React, { useRef, useState, useEffect } from "react";
import { UploadCloud, Plus } from "lucide-react";

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void;
  hasFiles: boolean;
}

export function DropZone({ onFilesAdded, hasFiles }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent, state: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(state);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesAdded(Array.from(e.dataTransfer.files));
    }
  };

  // Clipboard paste support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        onFilesAdded(Array.from(e.clipboardData.files));
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onFilesAdded]);

  if (hasFiles) {
    return (
      <div className="w-full">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          aria-label="Add more files"
          onChange={(e) => {
            if (e.target.files) onFilesAdded(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => handleDrag(e, true)}
          onDragLeave={(e) => handleDrag(e, false)}
          onDrop={handleDrop}
          className={`w-full py-4 px-6 rounded-2xl border-2 border-dashed flex items-center justify-center gap-3 text-xs font-semibold transition-all ${isDragOver
            ? "border-[#c8f03c] bg-[#c8f03c]/10 text-[#c8f03c] shadow-[0_0_25px_rgba(200,240,60,0.2)]"
            : "border-white/[0.1] bg-[#111113] hover:bg-[#18181b] hover:border-[#c8f03c]/50 text-[#9a9992] hover:text-[#f0efe9]"
            } active:scale-[0.98]`}
        >
          <Plus className="w-4 h-4 text-[#c8f03c]" aria-hidden="true" />
          <span className="hidden sm:inline">Drop more files here or click to browse (or paste with Ctrl+V)</span>
          <span className="sm:hidden">Tap to add more files</span>
        </button>
      </div>
    );
  }

  return (
    // A11y fix: outer div is now a proper button with keyboard support
    <div
      role="button"
      tabIndex={0}
      aria-label="Drop files here or press Enter to browse"
      onDragOver={(e) => handleDrag(e, true)}
      onDragLeave={(e) => handleDrag(e, false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`relative w-full rounded-3xl border-2 border-dashed p-8 sm:p-14 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f03c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b] ${isDragOver
        ? "border-[#c8f03c] bg-[#c8f03c]/10 scale-[1.01] shadow-[0_0_40px_rgba(200,240,60,0.25)]"
        : "border-white/[0.1] bg-[#111113]/90 hover:bg-[#18181b] hover:border-[#c8f03c]/40"
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files) onFilesAdded(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      {/* Center Icon */}
      <div className="w-16 h-16 rounded-2xl bg-[#c8f03c]/10 border border-[#c8f03c]/30 flex items-center justify-center text-[#c8f03c] shadow-[0_0_20px_rgba(200,240,60,0.15)]" aria-hidden="true">
        <UploadCloud className="w-8 h-8" />
      </div>

      {/* Main Text */}
      <div className="space-y-1.5">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#f0efe9]">
          Drop your files here
        </h2>
        <p className="text-xs text-[#8f8e86]">
          or <span className="text-[#c8f03c] font-semibold underline underline-offset-4">browse files</span> from your computer · Zero uploads to external servers
        </p>
      </div>

      {/* Format pills */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2 max-w-xl" aria-label="Supported formats">
        {["JPG", "PNG", "GIF", "MP4", "MOV", "AVIF", "WEBP", "MP3", "WAV", "HEIC", "PDF", "+ more"].map(
          (fmt, idx, arr) => {
            const isLast = idx === arr.length - 1;
            return (
              <span
                key={fmt}
                className={`text-[11px] font-semibold tracking-wider px-2.5 py-1 rounded-md border text-center transition-all ${isLast
                  ? "bg-[#c8f03c]/10 border-[#c8f03c]/40 text-[#c8f03c]"
                  : "bg-white/[0.04] border-white/[0.07] text-[#8f8e86] hover:bg-[#c8f03c]/10 hover:border-[#c8f03c]/40 hover:text-[#c8f03c]"
                  }`}
              >
                {fmt}
              </span>
            );
          }
        )}
      </div>
    </div>
  );
}
