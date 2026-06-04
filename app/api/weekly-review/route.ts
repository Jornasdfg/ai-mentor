import { NextRequest, NextResponse } from "next/server";
import { readWeeklyReview, writeWeeklyReview } from "@/lib/mentor/weeklyReviewStorage";
import { readTasks, writeTasks, ensureDataFiles } from "@/lib/mentor/mentorStorage";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";
import type { WeeklyReview, MentorTask } from "@/lib/mentorTypes";

export const runtime = "nodejs";

// GET: huidige weekanalyse voor de UI-kaart.
export async function GET() {
  const review = await readWeeklyReview();
  return NextResponse.json({ review });
}

// POST: ontvangt de weekanalyse van de maandag-routine (token-beveiligd).
// Slaat hem op én borgt dat er ALTIJD een "weekanalyse doorlezen"-taak in de
// planning staat, zodat Jorn de analyse iedere week echt even doet.
export async function POST(req: NextRequest) {
  try {
    const expected = process.env.MENTOR_ROUTINE_TOKEN;
    const provided = req.headers.get("x-mentor-routine-token");
    if (!expected || provided !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json() as Partial<WeeklyReview>;
    if (!body.summary?.trim() || !body.weekStart || !body.weekEnd) {
      return NextResponse.json({ error: "summary, weekStart en weekEnd zijn verplicht" }, { status: 400 });
    }

    const review: WeeklyReview = {
      generatedAt: body.generatedAt && !Number.isNaN(Date.parse(body.generatedAt))
        ? body.generatedAt
        : new Date().toISOString(),
      weekStart: body.weekStart,
      weekEnd: body.weekEnd,
      summary: body.summary.trim().slice(0, 600),
      highlights: Array.isArray(body.highlights) ? body.highlights.slice(0, 6).map(s => String(s).slice(0, 200)) : [],
      focusNextWeek: Array.isArray(body.focusNextWeek) ? body.focusNextWeek.slice(0, 3).map(s => String(s).slice(0, 200)) : [],
      metrics: body.metrics && typeof body.metrics === "object" ? body.metrics : undefined,
      source: body.source ? String(body.source).slice(0, 40) : "monday-routine",
    };
    await writeWeeklyReview(review);

    // Borg de "weekanalyse doorlezen"-taak: deterministische id per week → geen duplicaten.
    await ensureDataFiles();
    const tasks = await readTasks();
    const reviewTaskId = `task_weekreview_${review.weekStart}`;
    const alreadyOpen = tasks.some(t =>
      t.id === reviewTaskId && (t.status === "open" || t.status === "in_progress")
    );
    let taskCreated = false;
    if (!alreadyOpen) {
      const now = new Date().toISOString().slice(0, 10);
      const reviewTask: MentorTask = {
        id: reviewTaskId,
        title: `📊 Weekanalyse ${review.weekStart}–${review.weekEnd} doorlezen & week plannen`,
        project: "Routine",
        status: "open",
        priority: "P1",
        deadline: null,
        hardDeadline: null,
        softDeadline: null,
        startBy: null,
        deadlineType: "none",
        estimatedMinutes: 20,
        nextAction: "Lees de weekanalyse en bepaal de focus voor deze week",
        source: "system",
        reason: "Wekelijkse retrospective op basis van de geladen taakdata",
        createdAt: now,
        updatedAt: now,
        tags: ["weekreview", "routine"],
        plannedDate: null,
        plannedStart: null,
        plannedEnd: null,
        plannedMinutes: null,
        calendarSyncMode: "auto",
        taskKind: "task",
        autoSchedule: "auto",
        schedulingWindowId: "window_work",
        splittable: false,
        minBlockMinutes: 20,
        autoIgnore: false,
        locked: false,
      };
      tasks.push(reviewTask);
      await writeTasks(tasks);
      taskCreated = true;
    }

    // Herplan zodat de review-taak meteen in de werkweek landt (fire-and-forget).
    recalculateSchedule({ triggeredBy: "manual", horizonDays: 28, syncToGoogle: true }).catch(() => {});

    return NextResponse.json({ ok: true, taskCreated, review });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
