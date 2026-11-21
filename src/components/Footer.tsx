import React from "react";
import { Heart, Sparkles, Shield, Cpu, Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full border-t border-white/[0.06] bg-slate-950/60 mt-auto py-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-white/[0.06]">
          {/* Col 1 */}
          <div>
            <span className="font-bold text-base text-white">Pixshift</span>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              The universal, privacy-first in-browser conversion studio. Convert images, videos, audio, and documents locally with WebAssembly power.
            </p>
          </div>

          {/* Col 2 */}
          <div>
            <span className="font-semibold text-xs tracking-wider uppercase text-slate-300">Why It&apos;s Different</span>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
              <li className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero files ever leave your device</span>
              </li>
              <li className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>No queue wait times or upload bandwidth caps</span>
              </li>
              <li className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-violet-400" />
                <span>Runs directly on your hardware via WebAssembly</span>
              </li>
            </ul>
          </div>

          {/* Col 3 */}
          <div>
            <span className="font-semibold text-xs tracking-wider uppercase text-slate-300">Supported Technologies</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["WebAssembly", "FFmpeg", "Canvas API", "Web Workers", "Next.js 15", "pdf-lib", "JSZip"].map((t) => (
                <span key={t} className="px-2 py-0.5 rounded text-[11px] bg-white/[0.04] border border-white/[0.06] text-slate-300">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Pixshift. Open source under Apache 2.0.</p>
          <p className="flex items-center gap-1">
            Built by <a href="https://github.com/vrsn001" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline font-medium">Laksh Rohilla</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
