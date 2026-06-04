import { NextResponse } from "next/server";
import { readTasks, writeTasks, readRecurringTasks, ensureDataFiles } from "@/lib/mentor/mentorStorage";
import { materializeRecurringTasks, getTodayISO } from "@/lib/mentor/recurringTaskEngine";

export async function POST() {
  try {
    await ensureDataFiles();

    const [tasks, templates] = await Promise.all([readTasks(), readRecurringTasks()]);
    const todayISO = getTodayISO();

    const { tasks: updatedTasks, newCount } = materializeRecurringTasks(tasks, templates, todayISO, 62);

    if (newCount > 0) {
      await writeTasks(updatedTasks);
    }

    return NextResponse.json({ ok: true, newInstancesCreated: newCount });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
