import { NextRequest, NextResponse } from "next/server";
import { readWeeklyReview, writeWeeklyReview } from "@/lib/mentor/weeklyReviewStorage";
import {
  readTasks, writeTasks, ensureDataFiles,
  readRecurringTasks, writeRecurringTasks,
} from "@/lib/mentor/mentorStorage";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";
import { getTodayISO } from "@/lib/mentor/recurringTaskEngine";
import { sendPushToAll } from "@/lib/push/webPush";
import type { WeeklyReview, MentorRecurringTask } from "@/lib/mentorTypes";

const WEEKLY_REVIEW_ROUTINE_ID = "recurring_weekreview";

// Borgt de wekelijkse analyse als TERUGKERENDE routine op maandag (flexibel, maar
// vastgepind op de maandag). De scheduler materialiseert hem op de komende maandagen.
// Ruimt tegelijk oude losse "task_weekreview_*"-taken op (vorige implementatie).
async function ensureWeeklyReviewRoutine(): Promise<void> {
  const templates = await readRecurringTasks();
  if (!templates.some(t => t.id === WEEKLY_REVIEW_ROUTINE_ID)) {
    const now = new Date().toISOString();
    const template: MentorRecurringTask = {
      id: WEEKLY_REVIEW_ROUTINE_ID,
      title: "📊 Weekanalyse doorlezen & week plannen",
      project: "Routine",
      frequency: "weekly",
      interval: 1,
      daysOfWeek: [1],              // maandag
      startDate: getTodayISO(),
      isActive: true,
      priority: "P1",
      estimatedMinutes: 20,
      nextAction: "Lees de weekanalyse en bepaal de focus voor deze week",
      tags: ["weekreview", "routine"],
      hardDeadlineOffsetDays: 0,    // deadline = de maandag zelf
      executionMode: "manual",
      defaultPlannedTime: null,     // geen vast tijdstip → flexibel binnen de dag
      pinToOccurrenceDate: true,    // vastgepind op maandag
      calendarSyncMode: "none",
      createdAt: now,
      updatedAt: now,
    };
    await writeRecurringTasks([...templates, template]);
  }

  // Oude losse weekreview-taken (zonder recurrenceKey) opruimen.
  const tasks = await readTasks();
  const cleaned = tasks.filter(t => !(t.id.startsWith("task_weekreview_") && !t.recurrenceKey));
  if (cleaned.length !== tasks.length) await writeTasks(cleaned);
}

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

    // Bestaande review behouden (m.n. geüploade Instagram-data niet overschrijven).
    const prev = await readWeeklyReview();
    const linkinbioClicks = body.linkinbioClicks ?? prev?.linkinbioClicks ?? null;
    const affiliateRevenueEur = body.affiliateRevenueEur ?? prev?.affiliateRevenueEur ?? null;
    const keepInstagram = prev && prev.weekStart === body.weekStart ? prev.instagram ?? null : null;
    const prevFunnel = prev && prev.weekStart === body.weekStart ? prev.funnel ?? null : null;

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
      linkinbioClicks,
      affiliateRevenueEur,
      instagram: keepInstagram,
      funnel: prevFunnel
        ? { ...prevFunnel, linkinbioClicks, affiliateRevenueEur }
        : null,
    };
    await writeWeeklyReview(review);

    // Borg de wekelijkse analyse als terugkerende maandag-routine (en ruim oude losse taken op).
    await ensureDataFiles();
    await ensureWeeklyReviewRoutine();

    // Herplan: materialiseert de routine op de komende maandagen en plant ze in (fire-and-forget).
    recalculateSchedule({ triggeredBy: "manual", horizonDays: 28, syncToGoogle: true }).catch(() => {});

    // Push: weekanalyse staat klaar (fire-and-forget).
    sendPushToAll({
      title: "📊 Weekanalyse staat klaar",
      body: review.summary.slice(0, 140),
      url: "/", tag: "weekly-review",
    }).catch(() => {});

    return NextResponse.json({ ok: true, review });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
