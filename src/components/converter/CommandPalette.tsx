"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Command, Search, X } from "lucide-react";

export interface PaletteCommand {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: readonly PaletteCommand[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((idx) => (filtered.length > 0 ? (idx + 1) % filtered.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((idx) =>
          filtered.length > 0 ? (idx - 1 + filtered.length) % filtered.length : 0
        );
      } else if (e.key === "Enter") {
        const chosen = filtered[selectedIndex];
        if (chosen) {
          e.preventDefault();
          chosen.run();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, isOpen, onClose, selectedIndex]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center pt-[14vh] px-4 bg-black/75 backdrop-blur-md"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg rounded-xl bg-[#111113] border border-white/[0.16] shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.08]">
          <Search className="w-4 h-4 text-[#c8f03c] shrink-0" aria-hidden="true" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command (e.g. WebP, Flatten, PDF, Clear)..."
            className="flex-1 bg-transparent text-xs text-[#f0efe9] placeholder:text-[#8a8980] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="w-7 h-7 rounded flex items-center justify-center text-[#9a9992] hover:text-[#f0efe9]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8a8980] font-mono">
              No matching commands
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const active = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => {
                    cmd.run();
                    onClose();
                  }}
                  className={`w-full px-3 py-2 rounded-lg flex items-center justify-between text-left text-xs transition-colors ${
                    active
                      ? "bg-[#c8f03c]/15 text-[#c8f03c]"
                      : "text-[#f0efe9] hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Command className="w-3.5 h-3.5 opacity-60 shrink-0" aria-hidden="true" />
                    <span className="truncate font-medium">{cmd.label}</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase text-[#8a8980] shrink-0 ml-2">
                    {cmd.category}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
