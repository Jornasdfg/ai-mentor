import { NextRequest, NextResponse } from "next/server";
import { readScheduleBlocks, writeScheduleBlocks } from "@/lib/scheduler/scheduleStorage";
import { readTasks, writeTasks } from "@/lib/mentor/mentorStorage";
import { enqueueCalendarJob } from "@/lib/calendar/calendarOutbox";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as {
      end?: string;
      minutes?: number;
      updateEstimate?: boolean;
      syncToGoogle?: boolean;
    };

    const blocks = await readScheduleBlocks();
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return NextResponse.json({ error: "Block niet gevonden" }, { status: 404 });

    const block = blocks[idx];
    const now = new Date().toISOString();

    let newEnd = block.end;
    let newMinutes = block.durationMinutes;

    if (body.end) {
      newEnd = body.end;
      newMinutes = Math.round((new Date(body.end).getTime() - new Date(block.start).getTime()) / 60000);
    } else if (body.minutes) {
      const d = new Date(block.start);
      d.setMinutes(d.getMinutes() + body.minutes);
      newEnd = d.toISOString().slice(0, 19);
      newMinutes = body.minutes;
    }

    blocks[idx] = { ...block, end: newEnd, durationMinutes: newMinutes, locked: true, updatedAt: now };
    await writeScheduleBlocks(blocks);

    // Optionally update task estimatedMinutes
    if (body.updateEstimate) {
      const tasks = await readTasks();
      const ti = tasks.findIndex(t => t.id === block.taskId);
      if (ti !== -1) {
        tasks[ti] = { ...tasks[ti], estimatedMinutes: newMinutes, updatedAt: now };
        await writeTasks(tasks);
      }
    }

    // Queue Google sync
    if (body.syncToGoogle !== false) {
      const tasks = await readTasks();
      const task = tasks.find(t => t.id === block.taskId);
      if (task?.calendarSyncMode === "auto") {
        await enqueueCalendarJob(
          task.calendarLink?.eventId ? "update_event" : "create_event",
          task.id,
          task.calendarLink?.calendarId ?? "primary",
          { title: task.title, start: block.start, end: newEnd, timeZone: "Europe/Amsterdam", taskId: task.id },
          task.calendarLink?.eventId ?? undefined
        ).catch(() => {});
      }
    }

    await recalculateSchedule({ triggeredBy: "task_updated", syncToGoogle: body.syncToGoogle !== false });
    return NextResponse.json({ block: blocks[idx] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}