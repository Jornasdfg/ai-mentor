import { NextResponse } from "next/server";
import { incrementalSyncCalendar, fullSyncCalendar } from "@/lib/calendar/googleSyncEngine";
import { syncCacheToTasks } from "@/lib/calendar/googleTaskSyncMapper";
import { readSyncState, appendSyncLog } from "@/lib/calendar/googleSyncStorage";

// POST /api/google/calendar/repair-sync
// Runs incremental sync (or full sync if no syncToken).
// Handles 410 Gone internally via incrementalSyncCalendar.
// Intended to be called via cron every 15 minutes in production.
export async function POST() {
  const calendarId = process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";

  try {
    const syncState = await readSyncState(calendarId);
    const needsFull = !syncState?.nextSyncToken;

    const syncResult = needsFull
      ? await fullSyncCalendar(calendarId)
      : await incrementalSyncCalendar(calendarId);

    const taskResult = await syncCacheToTasks();

    await appendSyncLog(
      "repair",
      calendarId,
      `Repair sync (${syncResult.fullSync ? "full" : "incremental"}): ` +
      `${syncResult.changed} gewijzigd, ${syncResult.deleted} verwijderd, ` +
      `tasks updated=${taskResult.updated} conflicts=${taskResult.conflicts}`
    );

    return NextResponse.json({ ...syncResult, taskSync: taskResult });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Repair sync mislukt" },
      { status: 500 }
    );
  }
}
