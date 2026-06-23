import { NextRequest, NextResponse } from "next/server";
import { readScheduleBlocks, readScheduleRuns } from "@/lib/scheduler/scheduleStorage";
import { readTasks } from "@/lib/mentor/mentorStorage";
import { readEventCache } from "@/lib/calendar/googleSyncStorage";

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

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

    const filteredBlocks = blocks.filter(b => {
      if (from && b.start.slice(0, 10) < from) return false;
      if (to && b.start.slice(0, 10) > to) return false;
      return true;
    });

    let googleEvents: Array<{
      id: string; title: string; start: string; end: string;
      allDay: boolean; source: "google_calendar"; calendarId: string;
      description?: string | null; htmlLink?: string | null;
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
          const allDay = e.start.length <= 10;
          const startDay = e.start.slice(0, 10);
          // Hele-dag-eind is EXCLUSIEF in Google → laatste dag = eind - 1.
          const lastDay = allDay ? addDaysISO(e.end.slice(0, 10), -1) : e.end.slice(0, 10);
          // Overlap-test (niet alleen startdag) zodat meerdaagse events ook in latere weken tonen.
          if (to && startDay > to) return false;
          if (from && lastDay < from) return false;
          return true;
        })
        .map(e => {
          const allDay = e.start.length <= 10;
          // Voor hele-dag: eind inclusief laatste dag (eind-exclusief − 1 dag) op 23:59:59.
          const endIso = allDay ? `${addDaysISO(e.end.slice(0, 10), -1)}T23:59:59` : e.end;
          return {
            id: e.eventId,
            title: e.summary,
            start: allDay ? `${e.start}T00:00:00` : e.start,
            end: endIso,
            allDay,
            source: "google_calendar" as const,
            calendarId: e.calendarId,
            description: e.description ?? null,
            htmlLink: e.htmlLink ?? null,
          };
        });
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
