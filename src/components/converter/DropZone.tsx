"use client";

import React, { useRef, useState, useEffect } from "react";
import { UploadCloud, Plus, FolderOpen } from "lucide-react";
import { extractDroppedFiles, filterValidDroppedFiles } from "@/lib/utils/folderDrop";

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void;
  hasFiles: boolean;
}

export function DropZone({ onFilesAdded, hasFiles }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Ensure webkitdirectory and directory exist in DOM across all React hydration paths
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const handleDrag = (e: React.DragEvent, state: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(state);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const extracted = await extractDroppedFiles(e.dataTransfer);
    if (extracted.length > 0) {
      onFilesAdded(extracted);
    }
  };

  // Clipboard paste support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const valid = filterValidDroppedFiles(Array.from(e.clipboardData.files));
        if (valid.length > 0) {
          onFilesAdded(valid);
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onFilesAdded]);

  const hiddenInputs = (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="Select files"
        onChange={(e) => {
          if (e.target.files) {
            const valid = filterValidDroppedFiles(Array.from(e.target.files));
            if (valid.length > 0) onFilesAdded(valid);
          }
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        className="hidden"
        aria-label="Select folder"
        onChange={(e) => {
          if (e.target.files) {
            const valid = filterValidDroppedFiles(Array.from(e.target.files));
            if (valid.length > 0) onFilesAdded(valid);
          }
          e.target.value = "";
        }}
      />
    </>
  );

  if (hasFiles) {
    return (
      <div className="w-full space-y-2">
        {hiddenInputs}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => handleDrag(e, true)}
            onDragLeave={(e) => handleDrag(e, false)}
            onDrop={handleDrop}
            className={`flex-1 py-3.5 px-5 rounded-xl border border-dashed flex items-center justify-center gap-2.5 text-xs font-semibold transition-all active:scale-[0.98] ${
              isDragOver
                ? "border-[#c8f03c] bg-[#c8f03c]/10 text-[#c8f03c]"
                : "border-white/[0.12] bg-[#111113] hover:bg-[#18181b] hover:border-[#c8f03c]/50 text-[#9a9992] hover:text-[#f0efe9]"
            }`}
          >
            <Plus className="w-4 h-4 text-[#c8f03c]" aria-hidden="true" />
            <span className="hidden sm:inline">Drop more files or click to browse (Ctrl+V to paste)</span>
            <span className="sm:hidden">Tap to add more files</span>
          </button>

          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="py-3.5 px-4 rounded-xl border border-white/[0.1] bg-[#111113] hover:bg-[#18181b] hover:border-[#60a5fa]/50 text-xs font-semibold text-[#9a9992] hover:text-[#f0efe9] transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <FolderOpen className="w-4 h-4 text-[#60a5fa]" aria-hidden="true" />
            <span>Select Folder</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {hiddenInputs}
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[10px] tracking-widest uppercase text-[#8a8980]">
          01 // INPUT DECK
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            folderInputRef.current?.click();
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#111113] border border-white/[0.1] hover:border-[#60a5fa]/50 text-[11px] font-mono text-[#9a9992] hover:text-[#f0efe9] transition-colors active:scale-[0.98]"
        >
          <FolderOpen className="w-3.5 h-3.5 text-[#60a5fa]" aria-hidden="true" />
          <span>Select Folder</span>
        </button>
      </div>

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
        className={`relative w-full rounded-xl border border-dashed p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8f03c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0b] ${
          isDragOver
            ? "border-[#c8f03c] bg-[#c8f03c]/10 shadow-[0_0_30px_rgba(200,240,60,0.2)]"
            : "border-white/[0.14] bg-[#111113] hover:bg-[#18181b] hover:border-[#c8f03c]/45"
        }`}
      >
        <div className="w-14 h-14 rounded-xl bg-[#c8f03c]/10 border border-[#c8f03c]/30 flex items-center justify-center text-[#c8f03c]" aria-hidden="true">
          <UploadCloud className="w-7 h-7" />
        </div>

        <div className="space-y-1.5">
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#f0efe9]">
            Drop your files here
          </h2>
          <p className="text-xs text-[#9a9992]">
            or <span className="text-[#c8f03c] font-semibold underline underline-offset-4">browse files</span> from your computer · Zero uploads to external servers
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 max-w-xl" aria-label="Supported formats">
          {["JPG", "PNG", "GIF", "MP4", "MOV", "AVIF", "WEBP", "MP3", "WAV", "HEIC", "PDF", "+ more"].map(
            (fmt, idx, arr) => {
              const isLast = idx === arr.length - 1;
              return (
                <span
                  key={fmt}
                  className={`text-[11px] font-mono font-semibold tracking-wider px-2.5 py-1 rounded border text-center transition-colors ${
                    isLast
                      ? "bg-[#c8f03c]/10 border-[#c8f03c]/40 text-[#c8f03c]"
                      : "bg-white/[0.03] border-white/[0.08] text-[#9a9992] hover:border-[#c8f03c]/40 hover:text-[#c8f03c]"
                  }`}
                >
                  {fmt}
                </span>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
