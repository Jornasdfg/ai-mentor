import { NextRequest, NextResponse } from "next/server";
import { readScheduleBlocks, writeScheduleBlocks } from "@/lib/scheduler/scheduleStorage";
import { readTasks, writeTasks } from "@/lib/mentor/mentorStorage";
import { enqueueCalendarJob } from "@/lib/calendar/calendarOutbox";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const blocks = await readScheduleBlocks();
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return NextResponse.json({ error: "Block niet gevonden" }, { status: 404 });
    blocks.splice(idx, 1);
    await writeScheduleBlocks(blocks);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}

// Confirm / update a block (lock it, change source, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as { locked?: boolean; source?: string; syncToGoogle?: boolean };

    const blocks = await readScheduleBlocks();
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return NextResponse.json({ error: "Block niet gevonden" }, { status: 404 });

    const now = new Date().toISOString();
    blocks[idx] = {
      ...blocks[idx],
      ...(body.locked !== undefined ? { locked: body.locked } : {}),
      ...(body.source !== undefined ? { source: body.source as "auto_scheduler" | "manual_drag" | "manual_plan" } : {}),
      updatedAt: now,
    };
    await writeScheduleBlocks(blocks);

    // Sync task plannedStart/plannedEnd to match confirmed block
    if (body.locked) {
      const block = blocks[idx];
      const tasks = await readTasks();
      const taskIdx = tasks.findIndex(t => t.id === block.taskId);
      if (taskIdx >= 0) {
        tasks[taskIdx] = {
          ...tasks[taskIdx],
          plannedStart: block.start,
          plannedEnd: block.end,
          plannedMinutes: block.durationMinutes,
          updatedAt: now.slice(0, 10),
        };
        await writeTasks(tasks);
      }

      if (body.syncToGoogle !== false && block.taskId) {
        const jobType = block.calendarEventId ? "update_event" : "create_event";
        enqueueCalendarJob(
          jobType,
          block.taskId,
          block.calendarId ?? "primary",
          { blockId: block.id, title: block.title, start: block.start, end: block.end },
          block.calendarEventId ?? undefined
        ).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, block: blocks[idx] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
