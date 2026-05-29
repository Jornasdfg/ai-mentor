import { NextRequest, NextResponse } from "next/server";
import {
  readMentorState,
  ensureDataFiles,
  writeInbox,
  writeTasks,
  writeDecisions,
  appendContextArchive,
  readDecisions,
} from "@/lib/mentor/mentorStorage";
import { applyProposedPatches } from "@/lib/mentor/patchApplier";
import { regenerateDailyReference } from "@/lib/mentor/dailyReferenceGenerator";
import { readScheduleBlocks, writeScheduleBlocks } from "@/lib/scheduler/scheduleStorage";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";
import type { MentorPatch, MentorTask, ScheduleBlock } from "@/lib/mentorTypes";

export async function POST(req: NextRequest) {
  try {
    await ensureDataFiles();
    const body = await req.json() as { patches: MentorPatch[] };
    if (!Array.isArray(body.patches)) {
      return NextResponse.json({ error: "patches array vereist" }, { status: 400 });
    }

    const state = await readMentorState();
    const newState = applyProposedPatches(state, body.patches);

    await Promise.all([
      writeTasks(newState.tasks),
      writeDecisions(newState.decisions),
      writeInbox(newState.inboxItems),
    ]);

    for (const patch of body.patches) {
      if (patch.operation === "add_context_note" && patch.data.note) {
        await appendContextArchive(String(patch.data.note));
      }
    }

    await regenerateDailyReference(newState.tasks, newState.decisions);

    // Create locked schedule blocks for patches that include plannedStart/plannedEnd
    const plannedPatches = body.patches.filter(p =>
      (p.operation === "add_task" || p.operation === "update_task") &&
      (p.data as Record<string, unknown>).plannedStart
    );

    if (plannedPatches.length > 0) {
      const blocks = await readScheduleBlocks();
      const now = new Date().toISOString();

      for (const patch of plannedPatches) {
        const data = patch.data as Partial<MentorTask>;
        if (!data.plannedStart) continue;

        // Find the task (by taskId for update, or by title for add)
        let task: MentorTask | undefined;
        if (patch.operation === "update_task" && patch.taskId) {
          task = newState.tasks.find(t => t.id === patch.taskId);
        } else {
          task = newState.tasks.find(t => t.title === data.title);
        }
        if (!task) continue;

        const start = data.plannedStart;
        const end = data.plannedEnd ?? data.plannedStart;
        const durationMinutes = data.plannedMinutes ??
          (Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) ||
          (task.estimatedMinutes ?? 30));

        // Remove any existing blocks for this task (avoid duplicates)
        const filtered = blocks.filter(b => b.taskId !== task!.id);

        const newBlock: ScheduleBlock = {
          id: `block_mentor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          taskId: task.id,
          title: task.title,
          start,
          end,
          durationMinutes,
          status: "locked",
          colorState: "green",
          source: "manual_plan",
          locked: true,
          calendarSynced: false,
          calendarEventId: null,
          calendarId: null,
          runId: null,
          unscheduledReason: null,
          createdAt: now,
          updatedAt: now,
        };

        filtered.push(newBlock);
        blocks.length = 0;
        blocks.push(...filtered);
      }

      await writeScheduleBlocks(blocks);

      // Sync to Google Calendar
      recalculateSchedule({ triggeredBy: "task_updated", horizonDays: 28, syncToGoogle: true }).catch(console.error);
    }

    return NextResponse.json({
      ok: true,
      appliedCount: body.patches.length,
      tasks: newState.tasks,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
