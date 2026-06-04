import { NextRequest, NextResponse } from "next/server";
import {
  readSchedulingWindows,
  writeSchedulingWindows,
  ensureDefaultSchedulingWindows,
} from "@/lib/scheduler/scheduleStorage";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";
import type { SchedulingWindow, SchedulingWindowType } from "@/lib/mentorTypes";

export const runtime = "nodejs";

const TYPES: SchedulingWindowType[] = ["work", "personal", "anytime"];

export async function GET() {
  await ensureDefaultSchedulingWindows();
  const windows = await readSchedulingWindows();
  return NextResponse.json({ windows });
}

// Vervangt alle scheduling windows en herplant direct, zodat auto-taken meteen
// over de nieuw ingestelde werkdagen/tijden worden verspreid.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as { windows?: SchedulingWindow[] };
    if (!Array.isArray(body.windows)) {
      return NextResponse.json({ error: "windows array vereist" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const cleaned: SchedulingWindow[] = body.windows.map((w, i) => ({
      id: w.id || `window_${Date.now()}_${i}`,
      name: (w.name || "Venster").slice(0, 40),
      type: TYPES.includes(w.type) ? w.type : "work",
      daysOfWeek: Array.isArray(w.daysOfWeek)
        ? [...new Set(w.daysOfWeek.filter(d => d >= 1 && d <= 7))].sort((a, b) => a - b)
        : [],
      startTime: /^\d{2}:\d{2}$/.test(w.startTime) ? w.startTime : "09:00",
      endTime: /^\d{2}:\d{2}$/.test(w.endTime) ? w.endTime : "17:30",
      isActive: !!w.isActive,
      createdAt: w.createdAt || now,
      updatedAt: now,
    }));
    await writeSchedulingWindows(cleaned);
    recalculateSchedule({ triggeredBy: "manual", horizonDays: 28, syncToGoogle: true }).catch(() => {});
    return NextResponse.json({ windows: cleaned });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
