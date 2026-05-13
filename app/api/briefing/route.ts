import { NextResponse } from "next/server";
import { generateDailyBriefing, getRecentBriefings } from "@/lib/briefing/dailyBriefing";

export async function GET() {
  try {
    const briefings = await getRecentBriefings(7);
    return NextResponse.json({ briefings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ophalen mislukt" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const briefing = await generateDailyBriefing();
    return NextResponse.json({ briefing });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Briefing genereren mislukt" },
      { status: 500 }
    );
  }
}
