"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Download, Loader2, Lock, Radio, ShieldCheck, AlertCircle } from "lucide-react";
import { decryptSharePayload, type ShareFileMetadata } from "@/lib/share/crypto";
import { acceptP2POffer } from "@/lib/share/p2p";
import { triggerDownload } from "@/lib/utils/archive";

export default function ShareRecipientPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isP2pMode = searchParams.get("mode") === "p2p" || params.id === "p2p";

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ShareFileMetadata | null>(null);
  const [decryptedBlob, setDecryptedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // P2P receiver state
  const [offerInput, setOfferInput] = useState("");
  const [answerCode, setAnswerCode] = useState<string | null>(null);
  const [p2pStatus, setP2pStatus] = useState("Paste Offer Code from sender");
  const [allowStun, setAllowStun] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (isP2pMode) {
      setStatus("ready");
      return;
    }

    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const key = hashParams.get("k");

    if (!key) {
      setError("Missing decryption key (#k=...) in URL fragment.");
      setStatus("error");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(params.id)}`, {
          cache: "no-store",
        });

        if (res.status === 410) {
          throw new Error("This encrypted share link has expired or been burned.");
        }
        if (!res.ok) {
          throw new Error("Encrypted share record could not be found.");
        }

        let cipherBytes: Uint8Array;
        const cType = res.headers.get("content-type") ?? "";
        if (cType.includes("application/json")) {
          const desc = (await res.json()) as {
            downloadUrl: string;
            burnAfterRead: boolean;
          };
          const blobRes = await fetch(desc.downloadUrl, { mode: "cors", cache: "no-store" });
          if (!blobRes.ok) {
            throw new Error("Failed to download encrypted payload.");
          }
          cipherBytes = new Uint8Array(await blobRes.arrayBuffer());
          if (desc.burnAfterRead) {
            void fetch(`/api/share/${encodeURIComponent(params.id)}/consume`, {
              method: "POST",
            });
          }
        } else {
          cipherBytes = new Uint8Array(await res.arrayBuffer());
        }

        const decrypted = await decryptSharePayload(cipherBytes, key);
        if (cancelled) return;

        const blob = new Blob([decrypted.data.slice().buffer], {
          type: decrypted.meta.mime || "application/octet-stream",
        });
        setMeta(decrypted.meta);
        setDecryptedBlob(blob);
        if (decrypted.meta.mime.startsWith("image/")) {
          setPreviewUrl(URL.createObjectURL(blob));
        }
        setStatus("ready");
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to decrypt payload");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isP2pMode, params.id]);

  const handleAcceptP2P = async () => {
    setError(null);
    setP2pStatus("Generating WebRTC Answer...");
    try {
      const res = await acceptP2POffer(offerInput, {
        allowStun,
        onStatus: setP2pStatus,
        onReceiveFile: (receivedMeta, blob) => {
          setMeta(receivedMeta);
          setDecryptedBlob(blob);
          if (receivedMeta.mime.startsWith("image/")) {
            setPreviewUrl(URL.createObjectURL(blob));
          }
        },
      });
      setAnswerCode(res.answerCode);
      setP2pStatus("Send Answer Code back to sender to start transfer");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid WebRTC offer code");
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-[#f0efe9] flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl bg-[#111113] border border-white/[0.12] p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#c8f03c]/10 border border-[#c8f03c]/30 flex items-center justify-center text-[#c8f03c]">
              {isP2pMode ? <Radio className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
            <div>
              <h1 className="font-display text-sm font-bold">
                {isP2pMode ? "Pixshift P2P Receiver" : "Pixshift Zero-Knowledge Vault"}
              </h1>
              <p className="font-mono text-[10px] text-[#9a9992]">
                Decrypted strictly inside your browser
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="font-mono text-[11px] text-[#c8f03c] hover:underline"
          >
            Converter ↗
          </Link>
        </div>

        {status === "loading" && (
          <div className="py-10 flex flex-col items-center gap-2.5 text-xs font-mono text-[#c8f03c]">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Decrypting AES-256-GCM payload...</span>
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="rounded-lg bg-[#f03c8c]/10 border border-[#f03c8c]/40 p-4 flex items-start gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 text-[#f03c8c] shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {isP2pMode && !decryptedBlob && (
          <div className="space-y-3">
            <span className="block font-mono text-[10px] text-[#60a5fa]">{p2pStatus}</span>
            <label className="flex items-center gap-2 text-[11px] text-[#9a9992] cursor-pointer">
              <input
                type="checkbox"
                checked={allowStun}
                onChange={(e) => setAllowStun(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
              />
              <span>Allow Cloudflare STUN for cross-network transfer</span>
            </label>
            <textarea
              rows={3}
              placeholder="Paste Sender Offer Code..."
              value={offerInput}
              onChange={(e) => setOfferInput(e.target.value)}
              className="w-full p-2.5 rounded bg-[#0a0a0b] border border-white/[0.1] font-mono text-[11px]"
            />
            <button
              type="button"
              onClick={() => void handleAcceptP2P()}
              className="w-full py-2 rounded-lg bg-[#2563eb] text-xs font-bold text-white"
            >
              Generate Answer Code
            </button>
            {answerCode && (
              <div className="space-y-1">
                <span className="block font-mono text-[10px] text-[#c8f03c]">
                  Copy Answer Code to Sender:
                </span>
                <input
                  readOnly
                  value={answerCode}
                  className="w-full px-2.5 py-1.5 rounded bg-[#0a0a0b] border border-[#c8f03c]/40 font-mono text-[10px]"
                />
              </div>
            )}
          </div>
        )}

        {status === "ready" && decryptedBlob && meta && (
          <div className="space-y-4" data-testid="decrypted-share-ready">
            <div className="rounded-lg bg-[#0a0a0b] border border-[#c8f03c]/30 p-3 flex items-center gap-2.5 text-xs">
              <ShieldCheck className="w-4 h-4 text-[#c8f03c] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[#f0efe9] truncate">{meta.name}</p>
                <p className="font-mono text-[10px] text-[#9a9992]">
                  {meta.mime} · {(meta.size / 1024).toFixed(1)} KB · Verified AES-GCM
                </p>
              </div>
            </div>

            {previewUrl && (
              <div className="rounded-lg bg-[#0a0a0b] border border-white/[0.08] p-2 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt={meta.name}
                  className="max-h-72 rounded object-contain"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => triggerDownload(decryptedBlob, meta.name)}
              className="w-full py-2.5 rounded-lg bg-[#c8f03c] hover:bg-[#b5dc30] text-xs font-extrabold text-[#0a0a0b] flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download Decrypted File</span>
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
