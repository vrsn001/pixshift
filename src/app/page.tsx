import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Faq } from "@/components/Faq";
import { ConverterLoader } from "@/components/converter/ConverterLoader";
import { Shield, Zap, Infinity } from "lucide-react";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Background Ambience */}
      <div className="hero-grid" aria-hidden="true" />
      <div className="blob b1" aria-hidden="true" />
      <div className="blob b2" aria-hidden="true" />
      <div className="blob b3" aria-hidden="true" />

      <Header />

      <main className="max-w-4xl mx-auto px-4 pt-28 pb-16 flex-1 w-full space-y-12 relative z-10">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-2xl mx-auto pt-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.09] text-xs text-[#9a9992]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c8f03c] shadow-[0_0_8px_#c8f03c] animate-pulse" />
            <span>100% browser-based · Zero uploads · Free forever</span>
          </div>

          <h1 className="font-display text-4xl sm:text-6xl font-extrabold tracking-tight text-[#f0efe9] leading-[1.05]">
            Convert <em className="not-italic text-[#c8f03c] relative inline-block underline decoration-[#c8f03c]/40 decoration-wavy decoration-2 underline-offset-8">any file</em><br />
            to anything.
          </h1>

          <p className="text-sm sm:text-base text-[#9a9992] max-w-lg mx-auto font-light leading-relaxed">
            Drop your images, videos, audio, or PDFs. Everything converts on your device in seconds — your files never leave the browser.
          </p>
        </div>

        {/* Converter Workspace */}
        <ConverterLoader />

        {/* Feature Pills */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          <div className="p-6 rounded-2xl bg-[#111113] border border-white/[0.07] space-y-2 hover:border-[#c8f03c]/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/20 flex items-center justify-center text-[#c8f03c]">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#f0efe9]">Absolute Privacy</h3>
            <p className="text-xs text-[#9a9992] leading-relaxed">
              Your files never leave your device. All conversion happens inside your browser — nothing is uploaded anywhere.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#111113] border border-white/[0.07] space-y-2 hover:border-[#c8f03c]/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/20 flex items-center justify-center text-[#c8f03c]">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#f0efe9]">Native Speed</h3>
            <p className="text-xs text-[#9a9992] leading-relaxed">
              Uses compiled native code (WebAssembly) running directly on your hardware — conversions finish in seconds, not minutes.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#111113] border border-white/[0.07] space-y-2 hover:border-[#c8f03c]/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-[#f03c8c]/10 border border-[#f03c8c]/20 flex items-center justify-center text-[#f03c8c]">
              <Infinity className="w-4 h-4" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#f0efe9]">Unlimited & Free</h3>
            <p className="text-xs text-[#9a9992] leading-relaxed">
              Convert as many files as you want, any size, forever. No account needed.
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
