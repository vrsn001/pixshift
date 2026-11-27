import type { ShareFileMetadata } from "./crypto";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(encoded: string): Uint8Array {
  const padded = encoded
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function compressSignalString(payload: unknown): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== "undefined") {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    await writer.write(raw);
    await writer.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return `z.${toBase64Url(compressed)}`;
  }
  return `p.${toBase64Url(raw)}`;
}

export async function decompressSignalString<T>(code: string): Promise<T> {
  const trimmed = code.trim();
  const body = trimmed.slice(2);
  const bytes = fromBase64Url(body);
  if (trimmed.startsWith("z.") && typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    await writer.write(bytes.slice());
    await writer.close();
    const restored = await new Response(ds.readable).text();
    return JSON.parse(restored) as T;
  }
  if (trimmed.startsWith("p.")) {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }
  throw new Error("Invalid P2P session code format.");
}

function waitForIceComplete(pc: RTCPeerConnection, timeoutMs = 4500): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs);
    const handler = () => {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", handler);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", handler);
  });
}

export interface P2PSenderSession {
  offerCode: string;
  acceptAnswerCode: (answerCode: string) => Promise<void>;
  close: () => void;
}

/**
 * Starts a serverless WebRTC P2P sender session.
 * Defaults to strict LAN (`iceServers: []`, zero external servers); opt-in `allowStun` uses public Cloudflare STUN.
 */
export async function createP2PSender(
  fileBlob: Blob,
  meta: ShareFileMetadata,
  options: { allowStun?: boolean; onStatus?: (status: string) => void }
): Promise<P2PSenderSession> {
  const iceServers: RTCIceServer[] = options.allowStun
    ? [{ urls: "stun:stun.cloudflare.com:3478" }]
    : [];

  const pc = new RTCPeerConnection({ iceServers });
  const channel = pc.createDataChannel("pixshift-file", { ordered: true });
  channel.binaryType = "arraybuffer";

  channel.onopen = async () => {
    options.onStatus?.("Connected — transferring P2P...");
    channel.send(JSON.stringify({ type: "meta", meta }));
    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const CHUNK_SIZE = 16 * 1024;
    for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_SIZE) {
      while (channel.bufferedAmount > 512 * 1024) {
        await new Promise((r) => setTimeout(r, 20));
      }
      channel.send(bytes.slice(offset, offset + CHUNK_SIZE));
    }
    channel.send(JSON.stringify({ type: "eof" }));
    options.onStatus?.("Transfer complete!");
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceComplete(pc);

  const offerCode = await compressSignalString(pc.localDescription);
  return {
    offerCode,
    acceptAnswerCode: async (answerCode: string) => {
      const desc = await decompressSignalString<RTCSessionDescriptionInit>(answerCode);
      await pc.setRemoteDescription(desc);
    },
    close: () => {
      try {
        channel.close();
        pc.close();
      } catch {
        // ignore close errors
      }
    },
  };
}

/**
 * Accepts a sender Offer code and produces an Answer code while streaming the received file chunks.
 */
export async function acceptP2POffer(
  offerCode: string,
  options: {
    allowStun?: boolean;
    onReceiveFile: (meta: ShareFileMetadata, blob: Blob) => void;
    onStatus?: (status: string) => void;
  }
): Promise<{ answerCode: string; close: () => void }> {
  const iceServers: RTCIceServer[] = options.allowStun
    ? [{ urls: "stun:stun.cloudflare.com:3478" }]
    : [];

  const pc = new RTCPeerConnection({ iceServers });
  let incomingMeta: ShareFileMetadata | null = null;
  const chunks: ArrayBuffer[] = [];

  pc.ondatachannel = (ev) => {
    const channel = ev.channel;
    channel.binaryType = "arraybuffer";
    channel.onmessage = (msgEv) => {
      if (typeof msgEv.data === "string") {
        const parsed = JSON.parse(msgEv.data) as
          | { type: "meta"; meta: ShareFileMetadata }
          | { type: "eof" };
        if (parsed.type === "meta") {
          incomingMeta = parsed.meta;
          options.onStatus?.(`Receiving ${parsed.meta.name}...`);
        } else if (parsed.type === "eof" && incomingMeta) {
          const blob = new Blob(chunks, {
            type: incomingMeta.mime || "application/octet-stream",
          });
          options.onReceiveFile(incomingMeta, blob);
          options.onStatus?.("Received!");
        }
        return;
      }
      if (msgEv.data instanceof ArrayBuffer) {
        chunks.push(msgEv.data);
      }
    };
  };

  const offerDesc = await decompressSignalString<RTCSessionDescriptionInit>(offerCode);
  await pc.setRemoteDescription(offerDesc);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitForIceComplete(pc);

  return {
    answerCode: await compressSignalString(pc.localDescription),
    close: () => {
      try {
        pc.close();
      } catch {
        // ignore
      }
    },
  };
}
