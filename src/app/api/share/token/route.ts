import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { MAX_SHARE_BYTES } from "@/lib/share/storage";

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Direct Blob upload requires BLOB_READ_WRITE_TOKEN" },
      { status: 501 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/octet-stream"],
        maximumSizeInBytes: MAX_SHARE_BYTES,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // Metadata registration happens explicitly in POST /api/share
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload token failed" },
      { status: 400 }
    );
  }
}
