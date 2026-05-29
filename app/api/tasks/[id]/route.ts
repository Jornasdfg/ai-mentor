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
      "reason", "tags", "parkedReason", "coveyQuadrant",
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

    // If title changed, sync it to all existing blocks for this task
    if (typeof update.title === "string") {
      const { readScheduleBlocks, writeScheduleBlocks } = await import("@/lib/scheduler/scheduleStorage");
      const blocks = await readScheduleBlocks();
      const changed = blocks.map(b => b.taskId === id ? { ...b, title: update.title as string } : b);
      await writeScheduleBlocks(changed);
    }

    const decisions = await readDecisions();
    await regenerateDailyReference(tasks, decisions);
    // Only reschedule when fields that affect scheduling actually changed
    const schedulingFields = ["estimatedMinutes", "deadline", "hardDeadline", "softDeadline",
      "autoSchedule", "schedulingWindowId", "minBlockMinutes", "splittable", "coveyQuadrant",
      // Type/tijd/pin wijzigen → flexibele taken moeten opnieuw rond de afspraak plannen
      "taskKind", "plannedStart", "plannedEnd", "plannedMinutes", "locked"];
    if (schedulingFields.some(f => f in update)) {
      recalculateSchedule({ triggeredBy: "task_updated", horizonDays: 28, syncToGoogle: true }).catch(() => {});
    }
    return NextResponse.json({ task: tasks[idx] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { removeBlocksForTask } = await import("@/lib/scheduler/scheduleStorage");
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx < 0) return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
    tasks.splice(idx, 1);
    await writeTasks(tasks);
    await removeBlocksForTask(id);
    const decisions = await readDecisions();
    await regenerateDailyReference(tasks, decisions);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
