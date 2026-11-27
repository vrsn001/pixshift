import React from "react";
import { Shield, Cpu, Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full border-t border-white/[0.08] bg-[#0a0a0b] mt-auto py-12">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-white/[0.08]">
          {/* Col 1 */}
          <div>
            <span className="font-display font-extrabold text-base text-[#f0efe9]">
              Pix<span className="text-[#c8f03c]">shift</span>
            </span>
            <p className="text-xs text-[#9a9992] mt-2 leading-relaxed">
              Free, private, in-browser file converter. Images, videos, audio, and documents — all converted locally on your device.
            </p>
          </div>

          {/* Col 2 */}
          <div>
            <span className="font-semibold text-xs tracking-wider uppercase text-[#9a9992]">Why It&apos;s Different</span>
            <ul className="mt-2.5 space-y-2 text-xs text-[#9a9992]">
              <li className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[#c8f03c]" aria-hidden="true" />
                <span>Zero files ever leave your device</span>
              </li>
              <li className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-[#c8f03c]" aria-hidden="true" />
                <span>Runs natively via WebCodecs &amp; WebAssembly</span>
              </li>
              <li className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-[#60a5fa]" aria-hidden="true" />
                <span>Hardware-accelerated where browser supports it</span>
              </li>
            </ul>
          </div>

          {/* Col 3 */}
          <div>
            <span className="font-semibold text-xs tracking-wider uppercase text-[#9a9992]">Engine</span>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {["WebAssembly", "WebCodecs", "FFmpeg", "Canvas API", "Next.js 15", "pdf-lib", "JSZip"].map((t) => (
                <span key={t} className="px-2.5 py-1 rounded text-[11px] font-mono bg-[#111113] border border-white/[0.08] text-[#9a9992]">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8a8980]">
          <span>© {new Date().getFullYear()} Pixshift. All conversions run locally in your browser.</span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/vrsn001/pixshift"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#f0efe9] transition-colors"
            >
              GitHub
            </a>
            <span className="text-white/[0.08]" aria-hidden="true">|</span>
            <span>Built with Next.js 15 + WebAssembly</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
