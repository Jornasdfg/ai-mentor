import { NextRequest, NextResponse } from "next/server";
import { getShareToken } from "@/lib/werk/share";
import { normalizeClient } from "@/lib/werk/clients";

export const runtime = "nodejs";

// Geeft het deel-token voor de werkgever-link van een klant (de app bouwt de volledige URL).
export async function GET(req: NextRequest) {
  const client = normalizeClient(new URL(req.url).searchParams.get("client"));
  const token = await getShareToken(client);
  return NextResponse.json({ token, path: `/u/${token}` });
}
