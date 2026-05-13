import { NextRequest, NextResponse } from "next/server";
import { readConflicts, resolveConflict } from "@/lib/calendar/googleConflictStorage";
import { readTasks, writeTasks } from "@/lib/mentor/mentorStorage";
import { getCalendarProvider } from "@/lib/calendar/calendarProvider";

type Resolution = "google_wins_time" | "mentor_wins_time" | "keep_both";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as { resolution: Resolution; note?: string };
    const { resolution, note } = body;

    if (!["google_wins_time", "mentor_wins_time", "keep_both"].includes(resolution)) {
      return NextResponse.json({ error: "Ongeldige resolution waarde" }, { status: 400 });
    }

    const conflicts = await readConflicts();
    const conflict = conflicts.find(c => c.id === id);
    if (!conflict) {
      return NextResponse.json({ error: "Conflict niet gevonden" }, { status: 404 });
    }
    if (conflict.status === "resolved") {
      return NextResponse.json({ error: "Conflict is al opgelost" }, { status: 409 });
    }

    const tasks = await readTasks();
    const taskIdx = tasks.findIndex(t => t.id === conflict.taskId);
    const now = new Date().toISOString();

    if (resolution === "google_wins_time") {
      // Apply Google's start/end to the task
      if (taskIdx !== -1) {
        const { start, end } = conflict.googleEventSnapshot;
        if (start && end) {
          tasks[taskIdx] = {
            ...tasks[taskIdx],
            plannedStart: start,
            plannedEnd: end,
            plannedDate: start.slice(0, 10),
            calendarLink: {
              ...tasks[taskIdx].calendarLink!,
              syncStatus: "synced",
              lastSyncedAt: now,
              syncError: null,
              googleUpdatedAt: conflict.googleEventSnapshot.updated,
            },
            updatedAt: now,
          };
          await writeTasks(tasks);
        }
      }

    } else if (resolution === "mentor_wins_time") {
      // Push task's current time to Google Calendar
      const task = taskIdx !== -1 ? tasks[taskIdx] : null;
      if (task?.calendarLink?.eventId && task.plannedStart && task.plannedEnd) {
        const provider = getCalendarProvider();
        await provider.updateEvent({
          eventId: task.calendarLink.eventId,
          calendarId: task.calendarLink.calendarId ?? "primary",
          title: task.title,
          start: task.plannedStart,
          end: task.plannedEnd,
          timeZone: "Europe/Amsterdam",
        });
        tasks[taskIdx] = {
          ...task,
          calendarLink: {
            ...task.calendarLink,
            syncStatus: "synced",
            lastSyncedAt: now,
            syncError: null,
          },
          updatedAt: now,
        };
        await writeTasks(tasks);
      }

    }
    // keep_both: mark resolved without changing either side

    const resolved = await resolveConflict(id, resolution, note);
    return NextResponse.json({ conflict: resolved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Conflict oplossen mislukt" },
      { status: 500 }
    );
  }
}
