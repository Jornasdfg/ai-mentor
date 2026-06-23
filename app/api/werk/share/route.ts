import { NextResponse } from "next/server";
import { getShareToken } from "@/lib/werk/share";

export const runtime = "nodejs";

// Geeft het deel-token voor de werkgever-link (de app bouwt er de volledige URL mee).
export async function GET() {
  const token = await getShareToken();
  return NextResponse.json({ token, path: `/u/${token}` });
}
