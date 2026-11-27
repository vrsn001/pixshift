import { NextResponse } from "next/server";
import { getShareRecord } from "@/lib/share/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const res = await getShareRecord(id);
    if (res.status === "not_found") {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }
    if (res.status === "expired" || !res.meta) {
      return NextResponse.json({ error: "Share expired" }, { status: 410 });
    }

    if (res.cipherBytes) {
      return new NextResponse(Buffer.from(res.cipherBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "no-store",
          "X-Pixshift-Burn": res.meta.burnAfterRead ? "1" : "0",
          "X-Pixshift-Expires": String(res.meta.expiresAt),
        },
      });
    }

    return NextResponse.json({
      mode: "redirect",
      downloadUrl: res.meta.blobUrl,
      byteSize: res.meta.byteSize,
      burnAfterRead: res.meta.burnAfterRead,
      expiresAt: res.meta.expiresAt,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid share request" },
      { status: 400 }
    );
  }
}
