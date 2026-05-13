import { NextRequest, NextResponse } from "next/server";
import { readRecurringTasks, writeRecurringTasks, ensureDataFiles } from "@/lib/mentor/mentorStorage";
import type { MentorRecurringTask } from "@/lib/mentorTypes";

export async function GET() {
  await ensureDataFiles();
  const recurringTasks = await readRecurringTasks();
  return NextResponse.json({ recurringTasks });
}

export async function POST(req: NextRequest) {
  try {
    await ensureDataFiles();
    const body = await req.json() as Partial<MentorRecurringTask>;

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is verplicht" }, { status: 400 });
    }
    if (!body.frequency) {
      return NextResponse.json({ error: "frequency is verplicht" }, { status: 400 });
    }
    if (!body.startDate) {
      return NextResponse.json({ error: "startDate is verplicht" }, { status: 400 });
    }

    const now = new Date().toISOString().slice(0, 10);
    const template: MentorRecurringTask = {
      id: `recur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: body.title.trim(),
      project: body.project,
      frequency: body.frequency,
      interval: body.interval ?? 1,
      daysOfWeek: body.daysOfWeek,
      dayOfMonth: body.dayOfMonth,
      startDate: body.startDate,
      endDate: body.endDate ?? null,
      isActive: body.isActive ?? true,
      priority: body.priority ?? "P2",
      leadTimeDays: body.leadTimeDays,
      estimatedMinutes: body.estimatedMinutes,
      nextAction: body.nextAction,
      tags: body.tags ?? [],
      hardDeadlineOffsetDays: body.hardDeadlineOffsetDays,
      softDeadlineOffsetDays: body.softDeadlineOffsetDays,
      executionMode: body.executionMode ?? "manual",
      futureMcpAction: body.futureMcpAction,
      createdAt: now,
      updatedAt: now,
    };

    const existing = await readRecurringTasks();
    existing.push(template);
    await writeRecurringTasks(existing);

    return NextResponse.json({ recurringTask: template });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
