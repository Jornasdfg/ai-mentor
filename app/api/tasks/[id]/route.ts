import { NextRequest, NextResponse } from "next/server";
import { readTasks, writeTasks, readDecisions } from "@/lib/mentor/mentorStorage";
import { regenerateDailyReference } from "@/lib/mentor/dailyReferenceGenerator";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";
import type { MentorTask } from "@/lib/mentorTypes";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as Partial<MentorTask>;
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx < 0) return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });

    const now = new Date().toISOString().slice(0, 10);
    const allowed: (keyof MentorTask)[] = [
      "title", "project", "priority", "status", "deadline", "hardDeadline", "softDeadline",
      "startBy", "leadTimeDays", "deadlineType", "estimatedMinutes", "nextAction",
      "reason", "tags", "parkedReason",
      // Scheduler fields
      "taskKind", "autoSchedule", "schedulingWindowId", "minBlockMinutes", "splittable",
      "autoIgnore", "locked", "manualSortOrder", "calendarSyncMode",
      // Planningsvelden (nodig om een afspraak op een vast tijdstip te zetten)
      "plannedDate", "plannedStart", "plannedEnd", "plannedMinutes",
    ];
    const update = Object.fromEntries(
      Object.entries(body).filter(([k]) => allowed.includes(k as keyof MentorTask))
    );
    tasks[idx] = { ...tasks[idx], ...update, updatedAt: now };
    await writeTasks(tasks);
    const decisions = await readDecisions();
    await regenerateDailyReference(tasks, decisions);
    // Reschedule after update (fire-and-forget)
    recalculateSchedule({ triggeredBy: "task_updated", horizonDays: 28, syncToGoogle: true }).catch(() => {});
    return NextResponse.json({ task: tasks[idx] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}