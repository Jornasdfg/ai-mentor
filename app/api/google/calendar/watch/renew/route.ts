import { NextResponse } from "next/server";
import { renewWatchesIfNeeded } from "@/lib/calendar/googleWatchManager";

export async function POST() {
  try {
    const result = await renewWatchesIfNeeded();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Renew mislukt" },
      { status: 500 }
    );
  }
}
