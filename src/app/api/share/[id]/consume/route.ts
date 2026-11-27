import { NextResponse } from "next/server";
import { consumeShareRecord } from "@/lib/share/storage";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await consumeShareRecord(id);
    return NextResponse.json({ consumed: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to consume share" },
      { status: 400 }
    );
  }
}
