import { NextResponse } from "next/server";
import { getAIClient } from "@/lib/ai/modelRouter";
import { addCost } from "@/lib/storage/costStorage";
import { readWeeklyReview, writeWeeklyReview } from "@/lib/mentor/weeklyReviewStorage";
import { buildWeeklyReportText } from "@/lib/mentor/weeklyData";

export const runtime = "nodejs";

const SYSTEM =
  "Je bent Jorns groei-mentor voor Reishacker.nl. Op basis van de weekdata geef je 3 tot 5 KORTE, " +
  "concrete conclusies in het Nederlands (bullets met '- '). Focus op: wat werkte qua bereik/content, " +
  "hoe dat verkeer naar de link-in-bio bracht, en wat het opleverde aan affiliate-inkomsten. " +
  "Wees scherp en bruikbaar, max ~120 woorden, eindig met één concrete actie voor deze week. " +
  "Herhaal niet alle ruwe cijfers; geef inzicht. Geen JSON, alleen bullets.";

// Knop 1: korte AI-conclusies in de app (token-zuinig: compacte context, gpt-4o-mini).
export async function POST() {
  try {
    const review = await readWeeklyReview();
    if (!review || (!review.instagram && !review.affiliate && !review.metrics)) {
      return NextResponse.json({ error: "Nog geen weekdata om te analyseren." }, { status: 400 });
    }
    const context = buildWeeklyReportText(review, false);
    const client = getAIClient();
    const ai = await client.completeChat(SYSTEM, [{ role: "user", content: context }]);
    addCost(ai.inputTokens, ai.outputTokens, ai.costUSD).catch(() => {});

    const insight = (ai.text ?? "").trim();
    await writeWeeklyReview({ ...review, insightText: insight, insightAt: new Date().toISOString() });

    return NextResponse.json({ insight, costUSD: ai.costUSD });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
