"use client";

import React, { useRef, useState, useEffect } from "react";
import { UploadCloud, FileImage, FileVideo, FileAudio, FileText, Plus } from "lucide-react";

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void;
  hasFiles: boolean;
}

export function DropZone({ onFilesAdded, hasFiles }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle Drag events
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

  // Handle clipboard paste of files / screenshots
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
    // Compact Add Files button when queue already has items
    return (
      <div className="w-full">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
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
          className={`w-full py-4 px-6 rounded-2xl border-2 border-dashed flex items-center justify-center gap-3 text-xs font-semibold transition-all ${
            isDragOver
              ? "border-cyan-400 bg-cyan-500/10 text-cyan-300"
              : "border-white/[0.1] bg-slate-900/40 hover:bg-slate-900/80 hover:border-cyan-500/30 text-slate-400 hover:text-slate-200"
          }`}
        >
          <Plus className="w-4 h-4 text-cyan-400" />
          <span>Drop more files here or click to add (or paste with Ctrl+V)</span>
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => handleDrag(e, true)}
      onDragLeave={(e) => handleDrag(e, false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative w-full rounded-3xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-4 ${
        isDragOver
          ? "border-cyan-400 bg-cyan-500/10 scale-[1.01] shadow-2xl shadow-cyan-500/20"
          : "border-white/[0.12] bg-slate-900/50 hover:bg-slate-900/80 hover:border-cyan-500/40 glass-panel"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFilesAdded(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      {/* Center Icon */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-xl shadow-cyan-500/10">
        <UploadCloud className="w-8 h-8" />
      </div>

      {/* Main Text */}
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-white">
          Drop your files here to start
        </h2>
        <p className="text-xs text-slate-400">
          or <span className="text-cyan-400 font-semibold underline underline-offset-2">browse files</span> from your computer · Clipboard paste (Ctrl+V) supported
        </p>
      </div>

      {/* Format badges */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2 max-w-lg">
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300">
          <FileImage className="w-3 h-3 text-cyan-400" />
          <span>WebP, PNG, JPG, AVIF, HEIC, SVG</span>
        </span>
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300">
          <FileVideo className="w-3 h-3 text-violet-400" />
          <span>MP4, WebM, MKV, GIF, AVI</span>
        </span>
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300">
          <FileAudio className="w-3 h-3 text-emerald-400" />
          <span>MP3, WAV, OGG, AAC</span>
        </span>
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300">
          <FileText className="w-3 h-3 text-amber-400" />
          <span>PDF Documents</span>
        </span>
      </div>
    </div>
  );
}
