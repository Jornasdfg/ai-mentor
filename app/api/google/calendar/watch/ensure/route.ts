import { NextRequest, NextResponse } from "next/server";
import { ensureWatchActive } from "@/lib/calendar/googleWatchManager";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { calendarId?: string };
    const calendarId = body.calendarId ?? process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";

    const result = await ensureWatchActive(calendarId);

    // Strip tokenHash before returning to client
    const safeChannel = result.channel
      ? (({ tokenHash: _stripped, ...rest }) => rest)(result.channel)
      : null;

    return NextResponse.json({ action: result.action, channel: safeChannel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ensure watch mislukt" },
      { status: 500 }
    );
  }
}
