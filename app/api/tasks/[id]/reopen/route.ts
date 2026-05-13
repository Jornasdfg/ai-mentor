import { NextRequest, NextResponse } from "next/server";
import { readTasks, writeTasks, readDecisions } from "@/lib/mentor/mentorStorage";
import { regenerateDailyReference } from "@/lib/mentor/dailyReferenceGenerator";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx < 0) return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
    const now = new Date().toISOString().slice(0, 10);
    tasks[idx] = {
      ...tasks[idx],
      status: "open",
      completedAt: null,
      cancelledAt: null,
      updatedAt: now,
    };
    await writeTasks(tasks);
    const decisions = await readDecisions();
    await regenerateDailyReference(tasks, decisions);
    return NextResponse.json({ ok: true, task: tasks[idx] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
