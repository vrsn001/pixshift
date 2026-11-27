import { NextResponse } from "next/server";
import { getShareCapabilities } from "@/lib/share/storage";

export async function GET() {
  return NextResponse.json(getShareCapabilities());
}
