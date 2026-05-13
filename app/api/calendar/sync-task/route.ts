import { NextRequest, NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/mentor/mentorStorage";
import { getCalendarProvider } from "@/lib/calendar/calendarProvider";
import { taskToCalendarInput } from "@/lib/calendar/types";
import { enqueueCalendarJob } from "@/lib/calendar/calendarOutbox";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { taskId: string; mode?: "direct" | "outbox" };
    if (!body.taskId) {
      return NextResponse.json({ error: "taskId is verplicht" }, { status: 400 });
    }

    const mode = body.mode === "outbox" ? "outbox" : "direct";
    const tasks = await readTasks();
    const index = tasks.findIndex((t) => t.id === body.taskId);

    if (index === -1) {
      return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
    }

    const task = tasks[index];
    const input = taskToCalendarInput(task);

    if (!input) {
      return NextResponse.json(
        { error: "Taak heeft geen geplande start- en eindtijd. Stel plannedStart en plannedEnd in." },
        { status: 400 }
      );
    }

    // ── Outbox mode ─────────────────────────────────────────────────────────────
    if (mode === "outbox") {
      const calendarId = task.calendarLink?.calendarId ?? "primary";
      const hasExistingEvent = !!task.calendarLink?.eventId;
      const jobType = hasExistingEvent ? "update_event" : "create_event";

      const job = await enqueueCalendarJob(
        jobType,
        task.id,
        calendarId,
        input as unknown as Record<string, unknown>,
        task.calendarLink?.eventId ?? undefined
      );

      tasks[index] = {
        ...task,
        calendarLink: {
          ...task.calendarLink,
          syncStatus: "pending_google",
          syncError: null,
        },
        updatedAt: new Date().toISOString(),
      };
      await writeTasks(tasks);

      return NextResponse.json({ jobId: job.id, mode: "outbox", task: tasks[index] });
    }

    // ── Direct mode (default) ───────────────────────────────────────────────────
    const provider = getCalendarProvider();
    let result: { eventId: string; calendarId: string; htmlLink?: string | null };

    try {
      if (task.calendarLink?.eventId) {
        result = await provider.updateEvent({
          ...input,
          eventId: task.calendarLink.eventId,
          calendarId: task.calendarLink.calendarId ?? "primary",
        });
      } else {
        result = await provider.createEvent(input);
      }
    } catch (syncErr) {
      const errMsg = syncErr instanceof Error ? syncErr.message : "Onbekende sync fout";
      tasks[index] = {
        ...task,
        calendarLink: {
          ...task.calendarLink,
          syncStatus: "error",
          syncError: errMsg.slice(0, 200),
        },
        updatedAt: new Date().toISOString(),
      };
      await writeTasks(tasks);
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    tasks[index] = {
      ...task,
      calendarSyncMode: task.calendarSyncMode ?? "manual",
      calendarLink: {
        provider: provider.name === "google" ? "google" : "calendarmcp",
        calendarId: result.calendarId,
        eventId: result.eventId,
        htmlLink: result.htmlLink ?? null,
        lastSyncedAt: new Date().toISOString(),
        syncStatus: "synced",
        syncError: null,
      },
      updatedAt: new Date().toISOString(),
    };

    await writeTasks(tasks);
    return NextResponse.json({ mode: "direct", task: tasks[index] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Calendar sync mislukt" },
      { status: 500 }
    );
  }
}
