"use client";

import React from "react";

export function Header() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/[0.07]">
      {/* Brand Logo with Custom SVG Mark */}
      <a href="/" className="flex items-center gap-2.5 font-display font-extrabold text-2xl tracking-tight text-[#f0efe9] group">
        <svg className="w-8 h-8 shrink-0 transition-transform duration-300 group-hover:scale-105" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="16" fill="#111113" stroke="rgba(255,255,255,0.14)" />
          <path d="M16 20C16 16.6863 18.6863 14 22 14H36L28 30H16V20Z" fill="#c8f03c" />
          <path d="M48 44C48 47.3137 45.3137 50 42 50H28L36 34H48V44Z" fill="#c8f03c" />
          <polygon points="34,18 48,18 40,34 26,34" fill="#f0efe9" opacity="0.9" />
          <polygon points="30,46 16,46 24,30 38,30" fill="#f03c8c" opacity="0.85" />
          <circle cx="32" cy="32" r="3" fill="#0a0a0b" stroke="#c8f03c" strokeWidth="2" />
        </svg>
        <span>
          Pixy<span className="text-[#c8f03c] transition-colors group-hover:text-white">shift</span>
        </span>
      </a>

      {/* Center Badge */}
      <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] text-xs text-[#9a9992]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#c8f03c] shadow-[0_0_8px_#c8f03c] animate-pulse" />
        <span>100% browser-based · Zero uploads · Free forever</span>
      </div>

      {/* Nav Right */}
      <div className="flex items-center gap-6">
        <a href="#faq" className="hidden sm:inline-block text-xs font-medium text-[#9a9992] hover:text-[#f0efe9] transition-colors">
          FAQ
        </a>
        <a
          href="https://github.com/vrsn001/pixshift"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold px-4 py-1.5 rounded-lg border border-white/[0.14] text-[#f0efe9] hover:bg-[#18181b] hover:border-white/[0.25] transition-all flex items-center gap-1.5"
        >
          <span>GitHub</span>
          <span className="text-[#9a9992]">↗</span>
        </a>
      </div>
    </nav>
  );
}
