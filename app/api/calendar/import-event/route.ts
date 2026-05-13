import { NextRequest, NextResponse } from "next/server";
import { readTasks, writeTasks, readDecisions } from "@/lib/mentor/mentorStorage";
import { regenerateDailyReference } from "@/lib/mentor/dailyReferenceGenerator";
import type { MentorTask } from "@/lib/mentorTypes";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      calendarId?: string;
      eventId: string;
      title: string;
      start: string;
      end: string;
      htmlLink?: string | null;
      description?: string | null;
    };

    if (!body.eventId || !body.title || !body.start || !body.end) {
      return NextResponse.json(
        { error: "eventId, title, start en end zijn verplicht" },
        { status: 400 }
      );
    }

    const tasks = await readTasks();

    const existing = tasks.find(t => t.calendarLink?.eventId === body.eventId);
    if (existing) {
      return NextResponse.json({ task: existing, alreadyExists: true });
    }

    const now = new Date().toISOString();
    const plannedDate = body.start.slice(0, 10);
    const plannedMinutes = Math.max(
      0,
      Math.round((new Date(body.end).getTime() - new Date(body.start).getTime()) / 60000)
    );

    const task: MentorTask = {
      id: `task_calendar_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: body.title,
      project: "Agenda",
      status: "open",
      priority: "P2",
      source: "calendar",
      hardDeadline: plannedDate,
      deadline: plannedDate,
      deadlineType: "hard",
      plannedDate,
      plannedStart: body.start,
      plannedEnd: body.end,
      plannedMinutes,
      nextAction: body.description ? body.description.slice(0, 180) : "Check agenda-event en bepaal gewenste actie.",
      tags: ["calendar", "google"],
      calendarSyncMode: "manual",
      calendarLink: {
        provider: "google",
        calendarId: body.calendarId ?? "primary",
        eventId: body.eventId,
        htmlLink: body.htmlLink ?? null,
        lastSyncedAt: now,
        syncStatus: "synced",
        syncError: null,
      },
      createdAt: now,
      updatedAt: now,
    };

    const updated = [task, ...tasks];
    await writeTasks(updated);

    try {
      const decisions = await readDecisions();
      await regenerateDailyReference(updated, decisions);
    } catch {
      // niet blokkeren
    }

    return NextResponse.json({ task, alreadyExists: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agenda-event importeren mislukt" },
      { status: 500 }
    );
  }
}
