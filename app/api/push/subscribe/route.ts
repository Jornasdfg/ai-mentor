import { NextRequest, NextResponse } from "next/server";
import { addSubscription } from "@/lib/push/pushStorage";

export const runtime = "nodejs";

interface SubBody {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SubBody;
    const sub = body.subscription;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return NextResponse.json({ error: "Ongeldige subscription" }, { status: 400 });
    }
    await addSubscription({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
