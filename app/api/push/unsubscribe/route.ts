import { NextRequest, NextResponse } from "next/server";
import { removeSubscription } from "@/lib/push/pushStorage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { endpoint } = (await req.json()) as { endpoint?: string };
    if (!endpoint) return NextResponse.json({ error: "endpoint vereist" }, { status: 400 });
    await removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
