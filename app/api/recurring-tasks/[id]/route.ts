import { NextRequest, NextResponse } from "next/server";
import { readRecurringTasks, writeRecurringTasks } from "@/lib/mentor/mentorStorage";
import type { MentorRecurringTask } from "@/lib/mentorTypes";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as Partial<MentorRecurringTask>;
    const templates = await readRecurringTasks();
    const idx = templates.findIndex(t => t.id === id);
    if (idx < 0) return NextResponse.json({ error: "Template niet gevonden" }, { status: 404 });

    const allowed: (keyof MentorRecurringTask)[] = [
      "title", "project", "frequency", "interval", "daysOfWeek", "dayOfMonth",
      "startDate", "endDate", "isActive", "priority", "leadTimeDays",
      "estimatedMinutes", "nextAction", "tags", "hardDeadlineOffsetDays",
      "softDeadlineOffsetDays", "executionMode", "futureMcpAction",
    ];
    const update = Object.fromEntries(
      Object.entries(body).filter(([k]) => allowed.includes(k as keyof MentorRecurringTask))
    );
    const now = new Date().toISOString().slice(0, 10);
    templates[idx] = { ...templates[idx], ...update, updatedAt: now };
    await writeRecurringTasks(templates);

    return NextResponse.json({ recurringTask: templates[idx] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}

// Soft delete: sets isActive = false so no new instances are generated.
// Existing instances are preserved.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const templates = await readRecurringTasks();
    const idx = templates.findIndex(t => t.id === id);
    if (idx < 0) return NextResponse.json({ error: "Template niet gevonden" }, { status: 404 });

    const now = new Date().toISOString().slice(0, 10);
    templates[idx] = { ...templates[idx], isActive: false, updatedAt: now };
    await writeRecurringTasks(templates);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
