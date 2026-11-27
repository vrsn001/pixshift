import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MAX_SHARE_BYTES = 25 * 1024 * 1024; // 25 MB encrypted share limit
export const SERVERLESS_INLINE_CAP_BYTES = 4 * 1024 * 1024; // Under Vercel 4.5 MB limit

export interface ShareRecordMetadata {
  id: string;
  blobUrl?: string;
  byteSize: number;
  expiresAt: number;
  burnAfterRead: boolean;
}

const LOCAL_SHARE_DIR = path.join(process.cwd(), ".next", "cache", "pixshift-shares");

export function getShareCapabilities(): {
  modeA: boolean;
  modeB: boolean;
  maxBytes: number;
  storageKind: "vercel-blob" | "local-ephemeral" | "disabled";
} {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      modeA: true,
      modeB: true,
      maxBytes: MAX_SHARE_BYTES,
      storageKind: "vercel-blob",
    };
  }
  if (!process.env.VERCEL) {
    return {
      modeA: true,
      modeB: true,
      maxBytes: MAX_SHARE_BYTES,
      storageKind: "local-ephemeral",
    };
  }
  return {
    modeA: true,
    modeB: false,
    maxBytes: MAX_SHARE_BYTES,
    storageKind: "disabled",
  };
}

export function createShareId(): string {
  return crypto.randomBytes(12).toString("base64url");
}

function sanitizeShareId(id: string): string {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
    throw new Error("Invalid share ID");
  }
  return id;
}

function purgeExpiredLocalFiles(): void {
  if (!fs.existsSync(LOCAL_SHARE_DIR)) return;
  const now = Date.now();
  for (const name of fs.readdirSync(LOCAL_SHARE_DIR)) {
    if (!name.endsWith(".meta.json")) continue;
    const metaPath = path.join(LOCAL_SHARE_DIR, name);
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as ShareRecordMetadata;
      if (meta.expiresAt <= now) {
        fs.rmSync(metaPath, { force: true });
        fs.rmSync(metaPath.replace(/\.meta\.json$/, ".bin"), { force: true });
      }
    } catch {
      // ignore invalid cache files
    }
  }
}

export async function saveShareRecord(params: {
  id: string;
  cipherBytes?: Uint8Array;
  blobUrl?: string;
  byteSize: number;
  ttlHours: 1 | 24;
  burnAfterRead: boolean;
}): Promise<ShareRecordMetadata> {
  const safeId = sanitizeShareId(params.id);
  if (!Number.isFinite(params.byteSize) || params.byteSize <= 0 || params.byteSize > MAX_SHARE_BYTES) {
    throw new Error(`Encrypted share size must be between 1 byte and ${MAX_SHARE_BYTES} bytes.`);
  }

  const expiresAt = Date.now() + params.ttlHours * 3600 * 1000;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    let finalBlobUrl = params.blobUrl;

    if (!finalBlobUrl && params.cipherBytes) {
      const cipherUpload = await put(`shares/${safeId}.bin`, Buffer.from(params.cipherBytes), {
        access: "public",
        contentType: "application/octet-stream",
        addRandomSuffix: false,
      });
      finalBlobUrl = cipherUpload.url;
    }

    if (!finalBlobUrl) {
      throw new Error("Missing encrypted payload or blobUrl");
    }

    const record: ShareRecordMetadata = {
      id: safeId,
      blobUrl: finalBlobUrl,
      byteSize: params.byteSize,
      expiresAt,
      burnAfterRead: params.burnAfterRead,
    };

    await put(`shares/${safeId}.meta.json`, JSON.stringify(record), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });

    return record;
  }

  if (process.env.VERCEL) {
    throw new Error("Encrypted Vault storage is not configured on this deployment.");
  }

  if (!params.cipherBytes) {
    throw new Error("Missing ciphertext payload for local ephemeral store.");
  }

  purgeExpiredLocalFiles();
  fs.mkdirSync(LOCAL_SHARE_DIR, { recursive: true });
  const record: ShareRecordMetadata = {
    id: safeId,
    byteSize: params.byteSize,
    expiresAt,
    burnAfterRead: params.burnAfterRead,
  };
  fs.writeFileSync(path.join(LOCAL_SHARE_DIR, `${safeId}.bin`), params.cipherBytes);
  fs.writeFileSync(path.join(LOCAL_SHARE_DIR, `${safeId}.meta.json`), JSON.stringify(record));
  return record;
}

export async function getShareRecord(id: string): Promise<{
  status: "ok" | "not_found" | "expired";
  meta?: ShareRecordMetadata;
  cipherBytes?: Uint8Array;
}> {
  const safeId = sanitizeShareId(id);

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { list, del } = await import("@vercel/blob");
    const found = await list({ prefix: `shares/${safeId}.meta.json`, limit: 1 });
    const metaBlob = found.blobs[0];
    if (!metaBlob) return { status: "not_found" };

    const metaRes = await fetch(metaBlob.url, { cache: "no-store" });
    if (!metaRes.ok) return { status: "not_found" };
    const meta = (await metaRes.json()) as ShareRecordMetadata;

    if (meta.expiresAt <= Date.now()) {
      const toDelete = [metaBlob.url, ...(meta.blobUrl ? [meta.blobUrl] : [])];
      await del(toDelete).catch(() => {});
      return { status: "expired" };
    }

    if (meta.byteSize <= SERVERLESS_INLINE_CAP_BYTES && meta.blobUrl) {
      const dataRes = await fetch(meta.blobUrl, { cache: "no-store" });
      if (!dataRes.ok) return { status: "not_found" };
      const cipherBytes = new Uint8Array(await dataRes.arrayBuffer());
      if (meta.burnAfterRead) {
        await del([metaBlob.url, meta.blobUrl]).catch(() => {});
      }
      return { status: "ok", meta, cipherBytes };
    }

    return { status: "ok", meta };
  }

  if (process.env.VERCEL) {
    return { status: "not_found" };
  }

  const metaPath = path.join(LOCAL_SHARE_DIR, `${safeId}.meta.json`);
  const binPath = path.join(LOCAL_SHARE_DIR, `${safeId}.bin`);
  if (!fs.existsSync(metaPath) || !fs.existsSync(binPath)) {
    return { status: "not_found" };
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as ShareRecordMetadata;
  if (meta.expiresAt <= Date.now()) {
    fs.rmSync(metaPath, { force: true });
    fs.rmSync(binPath, { force: true });
    return { status: "expired" };
  }

  const cipherBytes = new Uint8Array(fs.readFileSync(binPath));
  if (meta.burnAfterRead) {
    fs.rmSync(metaPath, { force: true });
    fs.rmSync(binPath, { force: true });
  }
  return { status: "ok", meta, cipherBytes };
}

export async function consumeShareRecord(id: string): Promise<void> {
  const safeId = sanitizeShareId(id);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { list, del } = await import("@vercel/blob");
    const found = await list({ prefix: `shares/${safeId}.`, limit: 5 });
    const urls = found.blobs.map((b) => b.url);
    if (urls.length > 0) {
      await del(urls).catch(() => {});
    }
    return;
  }

  if (!process.env.VERCEL) {
    fs.rmSync(path.join(LOCAL_SHARE_DIR, `${safeId}.meta.json`), { force: true });
    fs.rmSync(path.join(LOCAL_SHARE_DIR, `${safeId}.bin`), { force: true });
  }
}
