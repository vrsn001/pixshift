import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Faq } from "@/components/Faq";
import { ConverterLoader } from "@/components/converter/ConverterLoader";
import { HardDrive, SlidersHorizontal, CircleOff } from "lucide-react";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Precision instrument micro-grid */}
      <div className="hero-grid" aria-hidden="true" />

      <Header />

      <main className="max-w-4xl mx-auto px-4 pt-28 pb-16 flex-1 w-full space-y-10 relative z-10">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-2xl mx-auto pt-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#111113] border border-white/[0.1] font-mono text-[11px] uppercase tracking-wider text-[#9a9992]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c8f03c] motion-safe:animate-pulse" aria-hidden="true" />
            <span>Runs in your browser</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-[#f0efe9] leading-[1.08]">
            Convert images, video, audio, and PDFs{" "}
            <em className="not-italic text-[#c8f03c] relative inline-block underline decoration-[#c8f03c]/40 decoration-wavy decoration-2 underline-offset-8">
              on your device.
            </em>
          </h1>

          <p className="text-sm sm:text-base text-[#9a9992] max-w-xl mx-auto leading-relaxed">
            Drop media below to convert between WebP, AVIF, MP4, MP3, GIF, and PDF. Nothing gets uploaded because your browser does the work.
          </p>
        </div>

        {/* Converter Workspace */}
        <ConverterLoader />

        {/* Feature Modules */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <div className="p-5 rounded-xl bg-[#111113] border border-white/[0.08] space-y-2 hover:border-white/[0.18] transition-colors">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/25 flex items-center justify-center text-[#c8f03c]" aria-hidden="true">
                <HardDrive className="w-4 h-4" />
              </div>
              <span className="font-mono text-[10px] tracking-widest text-[#8a8980]">01 // LOCAL</span>
            </div>
            <h3 className="font-display text-sm font-bold text-[#f0efe9]">Your files stay on your disk</h3>
            <p className="text-xs text-[#9a9992] leading-relaxed">
              Images decode via Canvas, documents via pdf-lib and PDF.js, and media transcodes inside local WebCodecs or self-hosted WASM.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#111113] border border-white/[0.08] space-y-2 hover:border-white/[0.18] transition-colors">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-[#2563eb]/15 border border-[#60a5fa]/30 flex items-center justify-center text-[#60a5fa]" aria-hidden="true">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <span className="font-mono text-[10px] tracking-widest text-[#8a8980]">02 // CONTROL</span>
            </div>
            <h3 className="font-display text-sm font-bold text-[#f0efe9]">Batch queues with real controls</h3>
            <p className="text-xs text-[#9a9992] leading-relaxed">
              Drop folders, trim video segments, strip EXIF tags, dial custom dimensions, inspect visual diffs, and bundle outputs into a deduplicated ZIP.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#111113] border border-white/[0.08] space-y-2 hover:border-white/[0.18] transition-colors">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.12] flex items-center justify-center text-[#f0efe9]" aria-hidden="true">
                <CircleOff className="w-4 h-4" />
              </div>
              <span className="font-mono text-[10px] tracking-widest text-[#8a8980]">03 // OPEN</span>
            </div>
            <h3 className="font-display text-sm font-bold text-[#f0efe9]">Pay for nothing</h3>
            <p className="text-xs text-[#9a9992] leading-relaxed">
              No sign-up walls, credit counters, or watermarked previews. Only bounded by your own device hardware and memory.
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <Faq />
      </main>

      <Footer />
    </div>
  );
}
