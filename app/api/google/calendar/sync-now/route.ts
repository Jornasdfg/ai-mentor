import { NextRequest, NextResponse } from "next/server";
import { fullSyncCalendar, incrementalSyncCalendar } from "@/lib/calendar/googleSyncEngine";
import { syncCacheToTasks } from "@/lib/calendar/googleTaskSyncMapper";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { calendarId?: string; mode?: string };
    const calendarId = body.calendarId ?? process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";
    const mode = body.mode === "full" ? "full" : "incremental";

    const syncResult = mode === "full"
      ? await fullSyncCalendar(calendarId)
      : await incrementalSyncCalendar(calendarId);

    const mapResult = await syncCacheToTasks();

    return NextResponse.json({ ...syncResult, taskSync: mapResult });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync mislukt" },
      { status: 500 }
    );
  }
}
