import { NextRequest, NextResponse } from "next/server";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";
import type { ScheduleRun } from "@/lib/mentorTypes";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      triggeredBy?: ScheduleRun["triggeredBy"];
      horizonDays?: number;
      syncToGoogle?: boolean;
    };
    const result = await recalculateSchedule({
      triggeredBy: body.triggeredBy ?? "manual",
      horizonDays: body.horizonDays ?? 28,
      syncToGoogle: body.syncToGoogle ?? true,
    });
    return NextResponse.json({
      run: result.run,
      blocksCreated: result.run.blocksCreated,
      blocksRemoved: result.run.blocksRemoved,
      warnings: result.warnings,
      tasksUpdated: result.tasks.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scheduler fout" },
      { status: 500 }
    );
  }
}