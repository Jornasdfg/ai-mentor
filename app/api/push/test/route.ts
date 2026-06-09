import { NextResponse } from "next/server";
import { sendPushToAll, pushConfigured } from "@/lib/push/webPush";

export const runtime = "nodejs";

// Stuurt een testnotificatie naar alle aangemelde apparaten.
export async function POST() {
  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push niet geconfigureerd (VAPID ontbreekt)" }, { status: 500 });
  }
  const res = await sendPushToAll({
    title: "AI Mentor ✅",
    body: "Notificaties werken! Je krijgt voortaan herinneringen en updates.",
    url: "/",
    tag: "test",
  });
  return NextResponse.json({ ok: true, ...res });
}
