"use client";

import React, { useState } from "react";
import { ChevronDown, ShieldCheck, Zap, Layers, Lock } from "lucide-react";

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: "Do my files ever get uploaded to a server?",
    a: "Never. Pixshift operates 100% locally on your computer inside your browser using WebAssembly (FFmpeg, Libheif) and the HTML5 Canvas API. Your files never touch external servers or cloud storage.",
  },
  {
    q: "Is there any file size limit or daily quota?",
    a: "No! Unlike traditional converters like CloudConvert that enforce 10MB limits or daily credits, Pixshift is unlimited and free forever. The only limit is your device's available memory.",
  },
  {
    q: "How are video and audio files converted client-side?",
    a: "We package WebAssembly-compiled FFmpeg into dedicated Web Workers. This enables full-featured video transcoding (MP4, WebM, GIF) and audio extraction (MP3, WAV, AAC) directly on your CPU without freezing the tab.",
  },
  {
    q: "Can I convert multiple images into a single PDF document?",
    a: "Yes! If you add multiple images and select PDF as the target format, a 'Merge images into single PDF' toggle appears in the action toolbar to compile them into a single ordered PDF book.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="w-full max-w-4xl mx-auto py-16 px-4">
      <div className="text-center space-y-2 mb-10">
        <h2 className="text-2xl font-bold tracking-tight text-white">Frequently Asked Questions</h2>
        <p className="text-xs text-slate-400">Everything you need to know about Pixshift&apos;s client-side engine</p>
      </div>

      <div className="space-y-3">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={faq.q}
              className="rounded-2xl bg-slate-900/50 border border-white/[0.08] overflow-hidden transition-all"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                    isOpen ? "rotate-180 text-cyan-400" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-4 text-xs text-slate-400 leading-relaxed border-t border-white/[0.04] pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
