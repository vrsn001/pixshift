"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: "Do my files ever get uploaded to a server?",
    a: "Never. Pixshift operates locally inside your browser using WebAssembly, WebCodecs, and the Canvas API. Your files stay on your device.",
  },
  {
    q: "Is there any file size limit or daily quota?",
    a: "No! Unlike upload converters that enforce small daily caps or credit paywalls, Pixshift has no server limits. The only limit is your browser's available memory.",
  },
  {
    q: "How are video and audio files converted client-side?",
    a: "Pixshift uses hardware WebCodecs via Mediabunny where supported and a self-hosted WebAssembly FFmpeg build directly inside your browser without server uploads.",
  },
  {
    q: "Can I convert multiple images into a single PDF document?",
    a: "Yes! Add multiple images targeting PDF and toggle 'Merge images to single PDF' in the action toolbar to compile them into one ordered PDF file.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="w-full max-w-3xl mx-auto py-14 px-4">
      <div className="text-center space-y-2 mb-8">
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#f0efe9]">Frequently Asked Questions</h2>
        <p className="text-xs text-[#9a9992]">Everything you need to know about Pixshift&apos;s client-side engine</p>
      </div>

      <div className="space-y-3">
        {FAQS.map((faq, i) => {
          const isOpen = openIndex === i;
          const panelId = `faq-panel-${i}`;
          return (
            <div
              key={faq.q}
              className="rounded-xl bg-[#111113] border border-white/[0.08] overflow-hidden transition-all"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 text-xs font-semibold text-[#f0efe9] hover:text-[#c8f03c] transition-colors"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#9a9992] transition-transform duration-200 shrink-0 ${
                    isOpen ? "rotate-180 text-[#c8f03c]" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <div id={panelId} className="px-5 pb-4 text-xs text-[#9a9992] leading-relaxed border-t border-white/[0.06] pt-3">
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
