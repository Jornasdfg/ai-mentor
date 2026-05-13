import { NextResponse } from "next/server";
import { readTasks, readDecisions } from "@/lib/mentor/mentorStorage";
import { regenerateDailyReference } from "@/lib/mentor/dailyReferenceGenerator";

export async function POST() {
  try {
    const [tasks, decisions] = await Promise.all([readTasks(), readDecisions()]);
    await regenerateDailyReference(tasks, decisions);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
