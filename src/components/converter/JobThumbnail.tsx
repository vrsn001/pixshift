"use client";

import React, { useEffect, useState } from "react";
import { FileAudio, FileImage, FileText, FileVideo } from "lucide-react";
import type { FileCategory } from "@/types/converter";

interface JobThumbnailProps {
  file: File;
  category: FileCategory;
  inputFormat: string;
}

const NON_BROWSER_IMAGE_FORMATS = new Set(["heic", "heif", "tiff"]);

export function JobThumbnail({ file, category, inputFormat }: JobThumbnailProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const shouldRenderImage =
    category === "image" && !NON_BROWSER_IMAGE_FORMATS.has(inputFormat.toLowerCase());
  const shouldRenderVideo = category === "video";

  useEffect(() => {
    setLoadFailed(false);
    if (!shouldRenderImage && !shouldRenderVideo) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, shouldRenderImage, shouldRenderVideo]);

  if (previewUrl && shouldRenderImage && !loadFailed) {
    return (
      <div className="w-12 h-12 rounded-lg bg-[#18181b] border border-white/[0.1] overflow-hidden shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={file.name}
          onError={() => setLoadFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  if (previewUrl && shouldRenderVideo && !loadFailed) {
    return (
      <div className="w-12 h-12 rounded-lg bg-[#18181b] border border-white/[0.1] overflow-hidden shrink-0">
        <video
          src={previewUrl}
          muted
          playsInline
          preload="metadata"
          onError={() => setLoadFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  const renderFallbackIcon = () => {
    switch (category) {
      case "video":
        return <FileVideo className="w-4 h-4 text-[#60a5fa]" aria-hidden="true" />;
      case "audio":
        return <FileAudio className="w-4 h-4 text-[#c8f03c]" aria-hidden="true" />;
      case "document":
        return <FileText className="w-4 h-4 text-[#f0efe9]" aria-hidden="true" />;
      default:
        return <FileImage className="w-4 h-4 text-[#c8f03c]" aria-hidden="true" />;
    }
  };

  return (
    <div className="w-12 h-12 rounded-lg bg-[#18181b] border border-white/[0.08] flex flex-col items-center justify-center gap-0.5 shrink-0">
      {renderFallbackIcon()}
      <span className="font-mono text-[9px] uppercase text-[#9a9992] leading-none">
        {inputFormat.slice(0, 4)}
      </span>
    </div>
  );
}
