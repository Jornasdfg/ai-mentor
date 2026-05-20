import { NextRequest, NextResponse } from "next/server";
import { readScheduleBlocks, writeScheduleBlocks } from "@/lib/scheduler/scheduleStorage";
import { readTasks } from "@/lib/mentor/mentorStorage";
import { enqueueCalendarJob } from "@/lib/calendar/calendarOutbox";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";
import type { ScheduleBlock } from "@/lib/mentorTypes";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      taskId: string;
      start: string;
      end: string;
      lock?: boolean;
      syncToGoogle?: boolean;
    };
    if (!body.taskId || !body.start || !body.end) {
      return NextResponse.json({ error: "taskId, start en end zijn verplicht" }, { status: 400 });
    }

    const tasks = await readTasks();
    const task = tasks.find(t => t.id === body.taskId);
    if (!task) return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });

    const now = new Date().toISOString();
    const durationMinutes = Math.round(
      (new Date(body.end).getTime() - new Date(body.start).getTime()) / 60000
    );

    const block: ScheduleBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      taskId: task.id,
      title: task.title,
      start: body.start,
      end: body.end,
      durationMinutes,
      status: "planned",
      colorState: "green",
      source: "manual_drag",
      locked: body.lock !== false,
      schedulingWindowId: null,
      calendarEventId: null,
      calendarId: null,
      calendarSynced: false,
      runId: null,
      createdAt: now,
      updatedAt: now,
    };

    const blocks = await readScheduleBlocks();
    blocks.push(block);
    await writeScheduleBlocks(blocks);

    if (body.syncToGoogle !== false && task.calendarSyncMode === "auto") {
      await enqueueCalendarJob(
        task.calendarLink?.eventId ? "update_event" : "create_event",
        task.id,
        task.calendarLink?.calendarId ?? "primary",
        { title: task.title, start: body.start, end: body.end, timeZone: "Europe/Amsterdam", taskId: task.id },
        task.calendarLink?.eventId ?? undefined
      ).catch(() => {});
    }

    await recalculateSchedule({ triggeredBy: "task_updated", syncToGoogle: body.syncToGoogle !== false });
    return NextResponse.json({ block });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}