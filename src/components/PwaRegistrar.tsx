"use client";

import React, { useEffect, useState } from "react";
import { DownloadCloud, CheckCircle2 } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegistrar() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [prewarmPct, setPrewarmPct] = useState<number | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const registerSw = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Ignore registration issues in restricted browser contexts
        });
    };

    if (document.readyState === "complete") {
      registerSw();
    } else {
      window.addEventListener("load", registerSw, { once: true });
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      window.removeEventListener("load", registerSw);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const res = await installPrompt.userChoice;
    if (res.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  const handleSaveOffline = async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const worker = reg.active;
    if (!worker) return;

    setPrewarmPct(0);
    const channel = new MessageChannel();
    channel.port1.onmessage = (ev: MessageEvent<{ type: string; completed?: number; total?: number }>) => {
      if (ev.data?.type === "PREWARM_PROGRESS" && ev.data.total) {
        setPrewarmPct(Math.round(((ev.data.completed ?? 0) / ev.data.total) * 100));
      } else if (ev.data?.type === "PREWARM_DONE") {
        setPrewarmPct(null);
        setOfflineReady(true);
      }
    };
    worker.postMessage({ type: "PREWARM_WASM" }, [channel.port2]);
  };

  return (
    <div className="flex items-center gap-2">
      {installPrompt && (
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#c8f03c]/15 border border-[#c8f03c]/40 text-[11px] font-mono font-bold text-[#c8f03c] hover:bg-[#c8f03c]/25 transition-colors"
        >
          <DownloadCloud className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Install App</span>
        </button>
      )}

      {offlineReady ? (
        <span className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#111113] border border-[#c8f03c]/30 font-mono text-[10px] text-[#c8f03c]">
          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
          <span>Offline Ready</span>
        </span>
      ) : (
        <button
          type="button"
          disabled={prewarmPct !== null}
          onClick={() => void handleSaveOffline()}
          title="Cache FFmpeg, PDF.js, and OCR WASM assets (~40 MB) for full offline use"
          className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#111113] border border-white/[0.1] hover:border-[#60a5fa]/45 font-mono text-[10px] text-[#9a9992] hover:text-[#f0efe9] transition-colors disabled:opacity-60"
        >
          <DownloadCloud className="w-3 h-3 text-[#60a5fa]" aria-hidden="true" />
          <span>{prewarmPct !== null ? `Caching ${prewarmPct}%` : "Save Tools Offline"}</span>
        </button>
      )}
    </div>
  );
}
