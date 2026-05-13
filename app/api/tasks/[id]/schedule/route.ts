import { NextRequest, NextResponse } from "next/server";
import { readTasks, writeTasks, readDecisions } from "@/lib/mentor/mentorStorage";
import { regenerateDailyReference } from "@/lib/mentor/dailyReferenceGenerator";
import type { CalendarSyncMode } from "@/lib/mentorTypes";

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as {
      plannedStart?: string | null;
      plannedEnd?: string | null;
      calendarSyncMode?: CalendarSyncMode;
    };

    const tasks = await readTasks();
    const index = tasks.findIndex(t => t.id === id);

    if (index === -1) {
      return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
    }

    const plannedDate = body.plannedStart ? body.plannedStart.slice(0, 10) : null;

    tasks[index] = {
      ...tasks[index],
      plannedStart: body.plannedStart ?? null,
      plannedEnd: body.plannedEnd ?? null,
      plannedDate,
      plannedMinutes: body.plannedStart && body.plannedEnd
        ? minutesBetween(body.plannedStart, body.plannedEnd)
        : null,
      calendarSyncMode: body.calendarSyncMode ?? tasks[index].calendarSyncMode ?? "none",
      updatedAt: new Date().toISOString(),
    };

    await writeTasks(tasks);

    try {
      const decisions = await readDecisions();
      await regenerateDailyReference(tasks, decisions);
    } catch {
      // reference update mag planning niet blokkeren
    }

    return NextResponse.json({ task: tasks[index] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Planning opslaan mislukt" },
      { status: 500 }
    );
  }
}
