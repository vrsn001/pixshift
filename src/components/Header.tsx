"use client";

import React from "react";

export function Header() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/[0.07]">
      {/* Brand Logo */}
      <a href="/" className="font-display font-extrabold text-2xl tracking-tight text-[#f0efe9] group">
        Pixy<span className="text-[#c8f03c] transition-colors group-hover:text-white">shift</span>
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
