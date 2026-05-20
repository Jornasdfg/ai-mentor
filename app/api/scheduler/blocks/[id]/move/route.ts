import { NextRequest, NextResponse } from "next/server";
import { readScheduleBlocks, writeScheduleBlocks } from "@/lib/scheduler/scheduleStorage";
import { enqueueCalendarJob } from "@/lib/calendar/calendarOutbox";
import { readTasks } from "@/lib/mentor/mentorStorage";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as {
      start: string;
      end: string;
      lock?: boolean;
      syncToGoogle?: boolean;
    };

    const blocks = await readScheduleBlocks();
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return NextResponse.json({ error: "Block niet gevonden" }, { status: 404 });

    const now = new Date().toISOString();
    const durationMinutes = Math.round(
      (new Date(body.end).getTime() - new Date(body.start).getTime()) / 60000
    );

    blocks[idx] = {
      ...blocks[idx],
      start: body.start,
      end: body.end,
      durationMinutes,
      source: "manual_drag",
      locked: body.lock !== false,
      updatedAt: now,
    };
    await writeScheduleBlocks(blocks);

    // Queue Google sync
    if (body.syncToGoogle !== false) {
      const tasks = await readTasks();
      const task = tasks.find(t => t.id === blocks[idx].taskId);
      if (task && task.calendarSyncMode === "auto") {
        await enqueueCalendarJob(
          task.calendarLink?.eventId ? "update_event" : "create_event",
          task.id,
          task.calendarLink?.calendarId ?? "primary",
          {
            title: task.title,
            start: body.start,
            end: body.end,
            timeZone: "Europe/Amsterdam",
            calendarId: task.calendarLink?.calendarId ?? "primary",
            taskId: task.id,
          },
          task.calendarLink?.eventId ?? undefined
        ).catch(() => {});
      }
    }

    // Recalculate unscheduled tasks around locked block
    await recalculateSchedule({ triggeredBy: "task_updated", syncToGoogle: body.syncToGoogle !== false });

    return NextResponse.json({ block: blocks[idx] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}