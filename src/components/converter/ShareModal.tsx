"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  Flame,
  Loader2,
  Lock,
  Radio,
  Share2,
  Shield,
  Smartphone,
  X,
} from "lucide-react";
import { encryptSharePayload } from "@/lib/share/crypto";
import { createP2PSender, type P2PSenderSession } from "@/lib/share/p2p";
import { encodeQrSvg } from "@/lib/share/qr";
import type { ConversionJob } from "@/types/converter";

interface ShareModalProps {
  job: ConversionJob | null;
  onClose: () => void;
}

export function ShareModal({ job, onClose }: ShareModalProps) {
  const [activeTab, setActiveTab] = useState<"vault" | "p2p">("vault");
  const [ttlHours, setTtlHours] = useState<1 | 24>(24);
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [qrSvgDataUrl, setQrSvgDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vaultAvailable, setVaultAvailable] = useState<boolean | null>(null);

  // Mode A P2P state
  const [allowStun, setAllowStun] = useState(false);
  const [p2pSession, setP2pSession] = useState<P2PSenderSession | null>(null);
  const [p2pAnswerInput, setP2pAnswerInput] = useState("");
  const [p2pStatus, setP2pStatus] = useState<string>("Idle");

  const output = job?.outputFiles?.[0];

  useEffect(() => {
    setShareUrl(null);
    setQrSvgDataUrl(null);
    setError(null);
    setCopied(false);
    setP2pAnswerInput("");
    setP2pStatus("Idle");
    if (p2pSession) {
      p2pSession.close();
      setP2pSession(null);
    }

    if (!job) return;

    fetch("/api/share/capabilities")
      .then((r) => r.json())
      .then((caps: { modeB?: boolean }) => {
        setVaultAvailable(Boolean(caps.modeB));
      })
      .catch(() => setVaultAvailable(true));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  useEffect(() => {
    return () => {
      p2pSession?.close();
    };
  }, [p2pSession]);

  if (!job || !output || typeof document === "undefined") return null;

  const overVaultCap = output.size > 24 * 1024 * 1024;
  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function";

  const handleNativeOsShare = async () => {
    if (!canNativeShare) return;
    try {
      const shareFile = new File([output.blob], output.name, {
        type: output.blob.type || "application/octet-stream",
      });
      if (navigator.canShare({ files: [shareFile] })) {
        await navigator.share({
          files: [shareFile],
          title: `Pixshift // ${output.name}`,
        });
      }
    } catch {
      // User dismissed OS share sheet cleanly
    }
  };

  const handleCreateEncryptedLink = async () => {
    setError(null);
    setIsCreating(true);
    try {
      const rawBytes = new Uint8Array(await output.blob.arrayBuffer());
      const { cipherBytes, keyBase64Url } = await encryptSharePayload(rawBytes, {
        name: output.name,
        mime: output.blob.type || "application/octet-stream",
        size: output.size,
      });

      let shareId: string;
      const SERVERLESS_THRESHOLD = 4 * 1024 * 1024;

      if (cipherBytes.byteLength > SERVERLESS_THRESHOLD) {
        const { upload } = await import("@vercel/blob/client");
        const cipherBlob = new Blob([cipherBytes.slice()], {
          type: "application/octet-stream",
        });
        const uploaded = await upload(`shares/upload-${Date.now()}.bin`, cipherBlob, {
          access: "public",
          handleUploadUrl: "/api/share/token",
        });
        const metaRes = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobUrl: uploaded.url,
            byteSize: cipherBytes.byteLength,
            ttlHours,
            burnAfterRead,
          }),
        });
        const metaData = (await metaRes.json()) as { id?: string; error?: string };
        if (!metaRes.ok || !metaData.id) {
          throw new Error(metaData.error || "Failed to register encrypted share link");
        }
        shareId = metaData.id;
      } else {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Pixshift-Ttl": String(ttlHours),
            "X-Pixshift-Burn": burnAfterRead ? "1" : "0",
          },
          body: cipherBytes.slice().buffer,
        });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !data.id) {
          throw new Error(data.error || "Failed to upload ciphertext");
        }
        shareId = data.id;
      }

      const fullUrl = `${window.location.origin}/s/${shareId}#k=${keyBase64Url}`;
      setShareUrl(fullUrl);
      const svg = encodeQrSvg(fullUrl);
      setQrSvgDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create encrypted share link");
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartP2P = async () => {
    setError(null);
    setP2pStatus("Gathering ICE candidates...");
    try {
      p2pSession?.close();
      const session = await createP2PSender(
        output.blob,
        {
          name: output.name,
          mime: output.blob.type || "application/octet-stream",
          size: output.size,
        },
        {
          allowStun,
          onStatus: setP2pStatus,
        }
      );
      setP2pSession(session);
      setP2pStatus("Waiting for receiver answer code...");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to initialize WebRTC P2P drop");
      setP2pStatus("Error");
    }
  };

  const handleCopy = async (text: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        className="w-full max-w-xl rounded-xl bg-[#111113] border border-white/[0.14] p-4 sm:p-6 shadow-2xl space-y-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/30 flex items-center justify-center text-[#c8f03c]">
              <Share2 className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="share-modal-title" className="font-display text-sm font-bold text-[#f0efe9] truncate">
                Anonymous Share // {output.name}
              </h3>
              <p className="font-mono text-[11px] text-[#9a9992]">
                {(output.size / 1024).toFixed(1)} KB · Zero login · Zero server keys
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9a9992] hover:text-[#f0efe9] hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "vault"}
            onClick={() => setActiveTab("vault")}
            className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === "vault"
                ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c]"
                : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
            }`}
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Encrypted Link (24h)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "p2p"}
            onClick={() => setActiveTab("p2p")}
            className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === "p2p"
                ? "bg-[#60a5fa]/20 border-[#60a5fa]/50 text-[#60a5fa]"
                : "bg-[#18181b] border-white/[0.08] text-[#9a9992] hover:text-[#f0efe9]"
            }`}
          >
            <Radio className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Zero-Server P2P / OS</span>
          </button>
        </div>

        {/* Mode B: Zero-Knowledge Encrypted Link */}
        {activeTab === "vault" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 text-[11px] text-[#9a9992] flex items-start gap-2">
              <Shield className="w-4 h-4 text-[#c8f03c] shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Encrypted locally with <strong className="text-[#f0efe9]">AES-256-GCM</strong> before upload. The decryption key lives strictly inside the URL <code className="text-[#c8f03c]">#k=</code> fragment and is never sent to the server.
              </span>
            </div>

            {vaultAvailable === false || overVaultCap ? (
              <div className="rounded-lg bg-[#f03c8c]/10 border border-[#f03c8c]/40 p-3 text-xs text-[#f0efe9]">
                {overVaultCap
                  ? "File exceeds the 25 MB Encrypted Link cap. Switch to the Zero-Server P2P tab for unlimited local transfers."
                  : "Encrypted Vault storage is not configured on this host. Use Zero-Server P2P transfer instead."}
              </div>
            ) : shareUrl ? (
              <div className="space-y-3" data-testid="encrypted-share-result">
                <div className="flex flex-col sm:flex-row items-center gap-4 rounded-lg bg-[#0a0a0b] border border-[#c8f03c]/35 p-3.5">
                  {qrSvgDataUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={qrSvgDataUrl}
                      alt="QR code for encrypted share link"
                      className="w-28 h-28 rounded-lg shrink-0 border border-white/[0.1]"
                    />
                  )}
                  <div className="flex-1 min-w-0 w-full space-y-2">
                    <span className="font-mono text-[10px] uppercase text-[#c8f03c] font-bold">
                      READY · EXPIRES IN {ttlHours}H{burnAfterRead ? " · BURN AFTER READ" : ""}
                    </span>
                    <input
                      readOnly
                      aria-label="Encrypted share URL"
                      value={shareUrl}
                      className="w-full px-2.5 py-1.5 rounded bg-[#18181b] border border-white/[0.1] font-mono text-[11px] text-[#f0efe9]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopy(shareUrl)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#0a0a0b] bg-[#c8f03c] hover:bg-[#b5dc30]"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? "Copied Link" : "Copy Link"}</span>
                      </button>
                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg text-xs font-mono border border-white/[0.12] text-[#f0efe9] hover:bg-white/[0.06]"
                      >
                        Open Link ↗
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-[#8a8980]">Expiry:</span>
                    {([1, 24] as const).map((h) => (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={ttlHours === h}
                        onClick={() => setTtlHours(h)}
                        className={`px-2.5 py-1 rounded font-mono text-xs border ${
                          ttlHours === h
                            ? "bg-[#c8f03c]/15 border-[#c8f03c]/50 text-[#c8f03c] font-bold"
                            : "bg-[#18181b] border-white/[0.08] text-[#9a9992]"
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>

                  <label className="flex items-center gap-2 text-xs text-[#f0efe9] cursor-pointer">
                    <Flame className="w-3.5 h-3.5 text-[#f03c8c]" aria-hidden="true" />
                    <span>Burn after 1st download</span>
                    <input
                      type="checkbox"
                      checked={burnAfterRead}
                      onChange={(e) => setBurnAfterRead(e.target.checked)}
                      className="w-4 h-4 rounded bg-[#18181b] border-white/[0.15] text-[#c8f03c]"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  disabled={isCreating}
                  onClick={() => void handleCreateEncryptedLink()}
                  className="w-full py-2.5 rounded-lg text-xs font-extrabold text-[#0a0a0b] bg-[#c8f03c] hover:bg-[#b5dc30] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Encrypting &amp; Uploading Ciphertext...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Encrypt &amp; Generate Share Link</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mode A: Zero-Server P2P + Native OS Share */}
        {activeTab === "p2p" && (
          <div className="space-y-3.5">
            {canNativeShare && (
              <button
                type="button"
                onClick={() => void handleNativeOsShare()}
                className="w-full py-2.5 px-4 rounded-lg bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.12] text-xs font-semibold text-[#f0efe9] flex items-center justify-center gap-2"
              >
                <Smartphone className="w-4 h-4 text-[#c8f03c]" aria-hidden="true" />
                <span>Share via Device OS Sheet (AirDrop / Nearby Share)</span>
              </button>
            )}

            <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#f0efe9]">Direct WebRTC P2P Drop</span>
                <span className="font-mono text-[10px] text-[#60a5fa]">{p2pStatus}</span>
              </div>

              <label className="flex items-center gap-2 text-[11px] text-[#9a9992] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowStun}
                  onChange={(e) => setAllowStun(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-[#18181b] border-white/[0.15]"
                />
                <span>Allow Cloudflare STUN for cross-network / cellular transfer (defaults to strict LAN)</span>
              </label>

              {!p2pSession ? (
                <button
                  type="button"
                  onClick={() => void handleStartP2P()}
                  className="w-full py-2 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-xs font-bold text-white"
                >
                  Start Direct P2P Session
                </button>
              ) : (
                <div className="space-y-2">
                  <div>
                    <span className="block font-mono text-[10px] text-[#8a8980] mb-1">
                      1. Open <code className="text-[#c8f03c]">/s/p2p?mode=p2p</code> on receiving device &amp; paste Offer Code:
                    </span>
                    <div className="flex gap-1.5">
                      <input
                        readOnly
                        value={p2pSession.offerCode}
                        className="flex-1 px-2 py-1 rounded bg-[#18181b] border border-white/[0.1] font-mono text-[10px] text-[#f0efe9]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCopy(p2pSession.offerCode)}
                        className="px-2.5 py-1 rounded bg-[#18181b] border border-white/[0.1] text-xs text-[#c8f03c]"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="block font-mono text-[10px] text-[#8a8980] mb-1">
                      2. Paste Receiver&apos;s Answer Code:
                    </span>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Paste Answer Code..."
                        value={p2pAnswerInput}
                        onChange={(e) => setP2pAnswerInput(e.target.value)}
                        className="flex-1 px-2 py-1 rounded bg-[#18181b] border border-white/[0.1] font-mono text-[10px] text-[#f0efe9]"
                      />
                      <button
                        type="button"
                        onClick={() => void p2pSession.acceptAnswerCode(p2pAnswerInput)}
                        className="px-3 py-1 rounded bg-[#c8f03c] text-xs font-bold text-[#0a0a0b]"
                      >
                        Connect
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-mono text-[#f03c8c]">
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
