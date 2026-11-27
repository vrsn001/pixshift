"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { FileCategory, SupportedFormat } from "@/types/converter";
import { AVAILABLE_TARGETS, FORMAT_REGISTRY } from "@/lib/converters/registry";
import { supportsAvifEncoding } from "@/lib/converters/imageConverter";

interface FormatSelectorProps {
  category: FileCategory;
  selectedFormat: SupportedFormat;
  onSelect: (format: SupportedFormat) => void;
  disabled?: boolean;
}

export function FormatSelector({ category, selectedFormat, onSelect, disabled }: FormatSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [avifSupported, setAvifSupported] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const targets = AVAILABLE_TARGETS[category] || AVAILABLE_TARGETS.image;

  useEffect(() => {
    if (category === "image") {
      supportsAvifEncoding().then(setAvifSupported).catch(() => setAvifSupported(false));
    }
  }, [category]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectedOpt = FORMAT_REGISTRY[selectedFormat] || {
    label: selectedFormat.toUpperCase(),
    description: "",
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Target format: ${selectedOpt.label}`}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111113] hover:bg-[#18181b] border border-white/[0.1] text-xs font-semibold text-[#f0efe9] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#c8f03c]/40 active:scale-[0.98]"
      >
        <span className="uppercase tracking-wider text-[#c8f03c] font-bold">{selectedOpt.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#9a9992] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={`Select ${category} target format`}
          className="absolute right-0 sm:right-0 left-0 sm:left-auto mt-1.5 w-56 rounded-xl bg-[#111113] border border-white/[0.14] shadow-2xl z-50 py-1.5 animate-fade-in"
        >
          <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-[#8a8980] border-b border-white/[0.06]">
            Target format ({category})
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {targets.map((fmt) => {
              const opt = FORMAT_REGISTRY[fmt];
              const isSelected = selectedFormat === fmt;
              const isAvifUnsupported = fmt === "avif" && avifSupported === false;

              return (
                <button
                  key={fmt}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isAvifUnsupported}
                  onClick={() => {
                    onSelect(fmt);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs hover:bg-[#c8f03c]/10 transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                    isSelected ? "bg-[#c8f03c]/15 text-[#c8f03c] font-bold" : "text-[#9a9992] hover:text-[#f0efe9]"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 uppercase font-bold tracking-wide">
                      <span>{opt?.label || fmt}</span>
                      {isAvifUnsupported && (
                        <span className="text-[9px] font-mono normal-case text-[#f03c8c] border border-[#f03c8c]/40 rounded px-1">
                          Unsupported in browser
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#8a8980] truncate max-w-[165px]">{opt?.description}</div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#c8f03c] shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
