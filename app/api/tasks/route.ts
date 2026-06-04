import { NextRequest, NextResponse } from "next/server";
import { readTasks, writeTasks, ensureDataFiles, readDecisions, readRecurringTasks } from "@/lib/mentor/mentorStorage";
import { materializeRecurringTasks, getTodayISO } from "@/lib/mentor/recurringTaskEngine";
import { regenerateDailyReference } from "@/lib/mentor/dailyReferenceGenerator";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";
import type { MentorTask } from "@/lib/mentorTypes";

export async function GET() {
  await ensureDataFiles();
  const [tasks, templates] = await Promise.all([readTasks(), readRecurringTasks()]);
  const todayISO = getTodayISO();
  const { tasks: updatedTasks, newCount } = materializeRecurringTasks(tasks, templates, todayISO, 62);
  if (newCount > 0) await writeTasks(updatedTasks);
  return NextResponse.json({ tasks: updatedTasks });
}

export async function POST(req: NextRequest) {
  try {
    await ensureDataFiles();
    const body = await req.json() as Partial<MentorTask>;
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is verplicht" }, { status: 400 });
    }
    const tasks = await readTasks();
    const now = new Date().toISOString().slice(0, 10);
    const taskKind = body.taskKind ?? "task";
    const isAppointment = taskKind === "appointment";
    const newTask: MentorTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: body.title.trim(),
      project: body.project,
      status: body.status ?? "open",
      priority: body.priority ?? "P2",
      deadline: body.deadline ?? null,
      hardDeadline: body.hardDeadline ?? body.deadline ?? null,
      softDeadline: body.softDeadline ?? null,
      startBy: body.startBy ?? null,
      leadTimeDays: body.leadTimeDays,
      deadlineType: body.deadlineType ?? (body.hardDeadline ? "hard" : "none"),
      estimatedMinutes: body.estimatedMinutes ?? 30,
      nextAction: body.nextAction,
      source: body.source ?? "manual_input",
      reason: body.reason,
      createdAt: now,
      updatedAt: now,
      tags: body.tags ?? [],
      plannedDate: body.plannedDate ?? null,
      plannedStart: body.plannedStart ?? null,
      plannedEnd: body.plannedEnd ?? null,
      plannedMinutes: body.plannedMinutes ?? null,
      calendarSyncMode: body.calendarSyncMode ?? "auto",
      // Scheduler defaults
      taskKind,
      // Afspraken (vast tijdstip) en handmatig geplande taken nooit auto-verschuiven.
      autoSchedule: body.autoSchedule ?? (isAppointment || body.plannedStart ? "off" : "auto"),
      schedulingWindowId: body.schedulingWindowId ?? "window_work",
      splittable: body.splittable ?? true,
      minBlockMinutes: body.minBlockMinutes ?? 30,
      autoIgnore: body.autoIgnore ?? false,
      locked: body.locked ?? false,
    };
    tasks.push(newTask);
    await writeTasks(tasks);
    const decisions = await readDecisions();
    await regenerateDailyReference(tasks, decisions);
    // Trigger scheduler after task create (fire-and-forget to keep response fast)
    recalculateSchedule({ triggeredBy: "task_created", horizonDays: 28, syncToGoogle: true }).catch(() => {});
    return NextResponse.json({ task: newTask });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}