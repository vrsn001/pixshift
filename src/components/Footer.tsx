import React from "react";
import { Shield, Cpu, Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full border-t border-white/[0.07] bg-[#0a0a0b] mt-auto py-12">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-white/[0.07]">
          {/* Col 1 */}
          <div>
            <span className="font-display font-extrabold text-base text-[#f0efe9]">
              Pixy<span className="text-[#c8f03c]">shift</span>
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
                <Shield className="w-3.5 h-3.5 text-[#c8f03c]" />
                <span>Zero files ever leave your device</span>
              </li>
              <li className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-[#c8f03c]" />
                <span>Instant — no waiting in line, no size restrictions</span>
              </li>
              <li className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-[#f03c8c]" />
                <span>Runs directly on your hardware via WebAssembly</span>
              </li>
            </ul>
          </div>

          {/* Col 3 */}
          <div>
            <span className="font-semibold text-xs tracking-wider uppercase text-[#9a9992]">Engine</span>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {["WebAssembly", "FFmpeg", "Canvas API", "Web Workers", "Next.js 15", "pdf-lib", "JSZip"].map((t) => (
                <span key={t} className="px-2.5 py-1 rounded text-[11px] font-medium bg-[#111113] border border-white/[0.08] text-[#9a9992]">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#5a5952]">
          <p>© {new Date().getFullYear()} Pixshift. Open source under Apache 2.0.</p>
          <p className="flex items-center gap-1">
            Built with ❤️ by <a href="https://github.com/vrsn001" target="_blank" rel="noopener noreferrer" className="text-[#c8f03c] hover:underline font-semibold">Laksh Rohilla</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
