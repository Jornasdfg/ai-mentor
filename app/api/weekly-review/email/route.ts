import { NextResponse } from "next/server";
import { readWeeklyReview } from "@/lib/mentor/weeklyReviewStorage";
import { buildWeeklyReportText } from "@/lib/mentor/weeklyData";

export const runtime = "nodejs";

const TO = "jornbooneinf@gmail.com";

// Knop 2: alle weekdata (affiliate + link-in-bio + Instagram + funnel + taken) naar mail.
// Verstuurt via Resend als RESEND_API_KEY is gezet; anders geeft het de tekst terug zodat
// de client een mailto-concept opent + het bestand downloadt (zero-setup fallback).
export async function POST() {
  try {
    const review = await readWeeklyReview();
    if (!review) return NextResponse.json({ error: "Nog geen weekdata." }, { status: 400 });

    const text = buildWeeklyReportText(review, true);
    const subject = `Reishacker weekdata ${review.weekStart}–${review.weekEnd}`;
    const apiKey = process.env.RESEND_API_KEY;

    if (apiKey) {
      const from = process.env.WEEKLY_EMAIL_FROM || "AI Mentor <onboarding@resend.dev>";
      const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap;font-size:13px">${text.replace(/</g, "&lt;")}</pre>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [TO], subject, text, html }),
      });
      if (res.ok) return NextResponse.json({ sent: true, to: TO });
      const err = await res.json().catch(() => ({}));
      // Val terug op client-side mailto/download.
      return NextResponse.json({ sent: false, to: TO, subject, text, error: `Resend ${res.status}: ${JSON.stringify(err)}` });
    }

    return NextResponse.json({ sent: false, to: TO, subject, text });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
