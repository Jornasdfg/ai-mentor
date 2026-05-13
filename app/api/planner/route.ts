import { NextRequest, NextResponse } from "next/server";
import { readTasks } from "@/lib/mentor/mentorStorage";
import { getCalendarProvider } from "@/lib/calendar/calendarProvider";
import { buildPlannerEvents } from "@/lib/calendar/planner";
import type { CalendarEventView } from "@/lib/mentorTypes";

function withTime(date: string, end = false): string {
  // Google Calendar API requires RFC3339 with timezone offset
  return `${date}T${end ? "23:59:59" : "00:00:00"}Z`;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    const to = url.searchParams.get("to") ?? from;
    const includeGoogle = url.searchParams.get("google") === "1";

    const tasks = await readTasks();

    let googleEvents: CalendarEventView[] = [];

    if (includeGoogle) {
      try {
        const provider = getCalendarProvider();
        googleEvents = await provider.listEvents({
          timeMin: withTime(from),
          timeMax: withTime(to, true),
          calendarId: "primary",
        });
      } catch (err) {
        return NextResponse.json({
          events: buildPlannerEvents(tasks, []),
          googleEventsError: err instanceof Error ? err.message : "Google Calendar fout",
        });
      }
    }

    return NextResponse.json({
      events: buildPlannerEvents(tasks, googleEvents),
      googleEventsError: null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Planner fout" },
      { status: 500 }
    );
  }
}
