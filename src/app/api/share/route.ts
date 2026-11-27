import { NextResponse } from "next/server";
import {
  createShareId,
  MAX_SHARE_BYTES,
  saveShareRecord,
  SERVERLESS_INLINE_CAP_BYTES,
} from "@/lib/share/storage";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const id = createShareId();

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        blobUrl?: string;
        byteSize?: number;
        ttlHours?: number;
        burnAfterRead?: boolean;
      };
      if (!body.blobUrl || !body.byteSize) {
        return NextResponse.json({ error: "Missing blobUrl or byteSize" }, { status: 400 });
      }
      const record = await saveShareRecord({
        id,
        blobUrl: body.blobUrl,
        byteSize: body.byteSize,
        ttlHours: body.ttlHours === 1 ? 1 : 24,
        burnAfterRead: Boolean(body.burnAfterRead),
      });
      return NextResponse.json({ id: record.id, expiresAt: record.expiresAt });
    }

    const ttlHeader = request.headers.get("x-pixshift-ttl");
    const burnHeader = request.headers.get("x-pixshift-burn");
    const ttlHours: 1 | 24 = ttlHeader === "1" ? 1 : 24;
    const burnAfterRead = burnHeader === "1" || burnHeader === "true";

    const buf = new Uint8Array(await request.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_SHARE_BYTES) {
      return NextResponse.json({ error: "Payload size out of bounds" }, { status: 400 });
    }
    if (process.env.VERCEL && buf.byteLength > SERVERLESS_INLINE_CAP_BYTES) {
      return NextResponse.json(
        { error: "Payloads over 4 MB require direct Blob upload token flow" },
        { status: 413 }
      );
    }

    const record = await saveShareRecord({
      id,
      cipherBytes: buf,
      byteSize: buf.byteLength,
      ttlHours,
      burnAfterRead,
    });

    return NextResponse.json({ id: record.id, expiresAt: record.expiresAt });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save encrypted share" },
      { status: 400 }
    );
  }
}
