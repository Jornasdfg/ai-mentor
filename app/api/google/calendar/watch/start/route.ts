import { NextRequest, NextResponse } from "next/server";
import { startWatch } from "@/lib/calendar/googleWatchManager";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { calendarId?: string };
    const calendarId = body.calendarId ?? process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";
    const channel = await startWatch(calendarId);

    // Strip tokenHash from the response — never expose to client
    const { tokenHash: _stripped, ...safeChannel } = channel;
    return NextResponse.json({ channel: safeChannel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Watch starten mislukt" },
      { status: 500 }
    );
  }
}
