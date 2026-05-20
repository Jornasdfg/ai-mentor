import { NextRequest, NextResponse } from "next/server";
import { readScheduleBlocks, readScheduleRuns } from "@/lib/scheduler/scheduleStorage";
import { readTasks } from "@/lib/mentor/mentorStorage";
import { readEventCache } from "@/lib/calendar/googleSyncStorage";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    const to = searchParams.get("to") ?? "";
    const includeGoogle = searchParams.get("google") !== "false";

    const [blocks, tasks, runs] = await Promise.all([
      readScheduleBlocks(),
      readTasks(),
      readScheduleRuns(),
    ]);

    // Filter blocks to requested range
    const filteredBlocks = blocks.filter(b => {
      if (from && b.start.slice(0, 10) < from) return false;
      if (to && b.start.slice(0, 10) > to) return false;
      return true;
    });

    // Google events as busy blocks (non-mentor events)
    let googleEvents: Array<{
      id: string; title: string; start: string; end: string;
      allDay: boolean; source: "google_calendar"; calendarId: string;
    }> = [];

    if (includeGoogle) {
      const cached = await readEventCache().catch(() => []);
      googleEvents = cached
        .filter(e => {
          if (e.status === "cancelled") return false;
          const isMentor = !!e.extendedProperties?.private?.aiMentorTaskId;
          return !isMentor;
        })
        .filter(e => {
          const start = e.start.length <= 10 ? e.start : e.start.slice(0, 10);
          if (from && start < from) return false;
          if (to && start > to) return false;
          return true;
        })
        .map(e => ({
          id: e.eventId,
          title: e.summary,
          start: e.start.length <= 10 ? `${e.start}T00:00:00` : e.start,
          end: e.end.length <= 10 ? `${e.end}T23:59:59` : e.end,
          allDay: e.start.length <= 10,
          source: "google_calendar" as const,
          calendarId: e.calendarId,
        }));
    }

    const lastRun = runs[0] ?? null;

    return NextResponse.json({
      blocks: filteredBlocks,
      tasks,
      googleEvents,
      lastRun,
      warnings: lastRun?.warnings ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fout bij ophalen blocks" },
      { status: 500 }
    );
  }
}