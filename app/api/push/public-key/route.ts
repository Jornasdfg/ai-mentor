import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Publieke VAPID-sleutel voor de client-subscription (privésleutel blijft server-side).
export async function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY ?? "" });
}
