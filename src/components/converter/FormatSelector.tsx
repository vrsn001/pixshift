"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { FileCategory, SupportedFormat } from "@/types/converter";
import { AVAILABLE_TARGETS, FORMAT_REGISTRY } from "@/lib/converters/registry";

interface FormatSelectorProps {
  category: FileCategory;
  selectedFormat: SupportedFormat;
  onSelect: (format: SupportedFormat) => void;
  disabled?: boolean;
}

export function FormatSelector({ category, selectedFormat, onSelect, disabled }: FormatSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const targets = AVAILABLE_TARGETS[category] || AVAILABLE_TARGETS.image;

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selectedOpt = FORMAT_REGISTRY[selectedFormat] || { label: selectedFormat.toUpperCase(), description: "" };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-white/[0.12] text-xs font-semibold text-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        <span className="uppercase tracking-wider text-cyan-400 font-bold">{selectedOpt.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/[0.14] shadow-2xl z-50 py-1.5 animate-fade-in">
          <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400 border-b border-white/[0.06]">
            Convert to {category}
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {targets.map((fmt) => {
              const opt = FORMAT_REGISTRY[fmt];
              const isSelected = selectedFormat === fmt;
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    onSelect(fmt);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs hover:bg-cyan-500/10 transition-colors ${
                    isSelected ? "bg-cyan-500/15 text-cyan-300 font-semibold" : "text-slate-300"
                  }`}
                >
                  <div>
                    <div className="uppercase font-bold tracking-wide">{opt?.label || fmt}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{opt?.description}</div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
