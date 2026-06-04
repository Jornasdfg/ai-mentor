import type { MentorTask, MentorRecurringTask } from "../mentorTypes";

// --- Date helpers (always local time, never UTC parsing) ---

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d); // local midnight — avoids UTC offset issues
}

export function addDays(date: Date, n: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

export function getTodayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

// --- Occurrence calculation ---

export function getOccurrencesBetween(
  template: MentorRecurringTask,
  fromDate: string,
  toDate: string
): string[] {
  if (!template.isActive) return [];

  const occurrences: string[] = [];
  const start = parseDate(template.startDate);
  const end = template.endDate ? parseDate(template.endDate) : null;
  const from = parseDate(fromDate);
  const to = parseDate(toDate);

  if (template.frequency === "daily") {
    let cur = new Date(start);
    // Advance to the first aligned date >= from
    while (cur < from) {
      cur = addDays(cur, template.interval);
    }
    while (cur <= to) {
      if (end && cur > end) break;
      occurrences.push(isoDate(cur));
      cur = addDays(cur, template.interval);
    }
  } else if (template.frequency === "weekly") {
    const days =
      template.daysOfWeek && template.daysOfWeek.length > 0
        ? template.daysOfWeek
        : [start.getDay()]; // default: same weekday as startDate

    // Anchor to the Sunday of the week that contains startDate
    const startSunday = addDays(start, -start.getDay());
    let weekSunday = new Date(startSunday);

    while (weekSunday <= to) {
      for (const dow of days) {
        const occurrence = addDays(weekSunday, dow);
        if (occurrence < start) continue;
        if (occurrence < from) continue;
        if (occurrence > to) continue;
        if (end && occurrence > end) continue;
        occurrences.push(isoDate(occurrence));
      }
      weekSunday = addDays(weekSunday, template.interval * 7);
    }
  } else if (template.frequency === "monthly") {
    const targetDay = template.dayOfMonth ?? start.getDate();
    let yr = start.getFullYear();
    let mo = start.getMonth(); // 0-indexed

    while (true) {
      // Clamp to last valid day of the month (e.g. Feb 30 → Feb 28)
      const daysInMonth = new Date(yr, mo + 1, 0).getDate();
      const day = Math.min(targetDay, daysInMonth);
      const occurrence = new Date(yr, mo, day);

      if (occurrence > to) break;
      if (end && occurrence > end) break;

      if (occurrence >= start && occurrence >= from) {
        occurrences.push(isoDate(occurrence));
      }

      mo += template.interval;
      yr += Math.floor(mo / 12);
      mo = ((mo % 12) + 12) % 12;
    }
  }

  return [...new Set(occurrences)].sort();
}

// --- Task instantiation ---

export function createTaskFromRecurringTemplate(
  template: MentorRecurringTask,
  occurrenceDate: string
): MentorTask {
  const recurrenceKey = `${template.id}:${occurrenceDate}`;
  const now = getTodayISO();

  // Hard deadline: occurrenceDate + offset, or occurrenceDate itself
  let hardDeadline: string | null = null;
  if (template.hardDeadlineOffsetDays !== undefined && template.hardDeadlineOffsetDays !== null) {
    hardDeadline = isoDate(addDays(parseDate(occurrenceDate), template.hardDeadlineOffsetDays));
  } else {
    hardDeadline = occurrenceDate;
  }

  // Soft deadline: optional offset
  let softDeadline: string | null = null;
  if (template.softDeadlineOffsetDays !== undefined && template.softDeadlineOffsetDays !== null) {
    softDeadline = isoDate(addDays(parseDate(occurrenceDate), template.softDeadlineOffsetDays));
  }

  // startBy = hardDeadline - leadTimeDays
  let startBy: string | null = null;
  if (hardDeadline && template.leadTimeDays) {
    startBy = isoDate(addDays(parseDate(hardDeadline), -template.leadTimeDays));
  }

  const tags = [...(template.tags ?? [])];
  if (!tags.includes("recurring")) tags.push("recurring");

  // Planning fields from template defaults
  let plannedDate: string | null = null;
  let plannedStart: string | null = null;
  let plannedEnd: string | null = null;
  let plannedMinutes: number | null = null;

  if (template.defaultPlannedTime) {
    const durationMins = template.defaultDurationMinutes ?? template.estimatedMinutes ?? 30;
    plannedDate = occurrenceDate;
    plannedStart = combineDateAndTime(occurrenceDate, template.defaultPlannedTime);
    plannedEnd = addMinutesToLocalISO(plannedStart, durationMins);
    plannedMinutes = durationMins;
  }

  // Dag-gepinde routine: flexibel auto-plannen, maar vastgezet op de occurrence-dag.
  const pinned = template.pinToOccurrenceDate === true && !template.defaultPlannedTime;

  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: template.title,
    project: template.project,
    status: "open",
    priority: template.priority,
    source: "recurring_manual",
    deadline: hardDeadline,
    hardDeadline,
    softDeadline,
    startBy,
    leadTimeDays: template.leadTimeDays,
    deadlineType: hardDeadline ? "hard" : "none",
    estimatedMinutes: template.estimatedMinutes,
    nextAction: template.nextAction,
    tags,
    reason: `Routine: "${template.title}"`,
    isRecurringInstance: true,
    recurrenceTemplateId: template.id,
    recurrenceDate: occurrenceDate,
    recurrenceKey,
    plannedDate,
    plannedStart,
    plannedEnd,
    plannedMinutes,
    // Karakter: instances van een routine zijn altijd "routine" (≠ losse taak/afspraak).
    // Zo blijven ze uit de Taken-lijst/Covey en leven ze alleen als planbaar blok in de planner.
    taskKind: "routine",
    autoSchedule: pinned ? "auto" : (plannedStart ? "off" : "auto"),
    scheduleOnDate: pinned ? occurrenceDate : null,
    calendarSyncMode: template.calendarSyncMode ?? "none",
    createdAt: now,
    updatedAt: now,
  };
}

// --- Materialization ---

export function materializeRecurringTasks(
  tasks: MentorTask[],
  templates: MentorRecurringTask[],
  todayISO: string,
  horizonDays = 14
): { tasks: MentorTask[]; newCount: number } {
  const horizonDate = isoDate(addDays(parseDate(todayISO), horizonDays));

  // Collect all existing recurrenceKeys (including done/cancelled — don't re-create those)
  const existingKeys = new Set(
    tasks.filter(t => t.recurrenceKey).map(t => t.recurrenceKey!)
  );

  const newTasks: MentorTask[] = [];

  for (const template of templates) {
    if (!template.isActive) continue;

    const occurrences = getOccurrencesBetween(template, todayISO, horizonDate);

    for (const occurrenceDate of occurrences) {
      const key = `${template.id}:${occurrenceDate}`;
      if (existingKeys.has(key)) continue;

      const newTask = createTaskFromRecurringTemplate(template, occurrenceDate);
      newTasks.push(newTask);
      existingKeys.add(key); // prevent double-add within the same run
    }
  }

  return {
    tasks: [...tasks, ...newTasks],
    newCount: newTasks.length,
  };
}

// --- DateTime helpers ---

export function combineDateAndTime(dateISO: string, timeHHmm: string): string {
  return `${dateISO}T${timeHHmm}:00`;
}

export function addMinutesToLocalISO(localISO: string, minutes: number): string {
  const d = new Date(localISO);
  d.setMinutes(d.getMinutes() + minutes);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}:00`;
}

// --- Next occurrence helper (for UI display) ---

export function getNextOccurrence(template: MentorRecurringTask, fromDate?: string): string | null {
  const today = fromDate ?? getTodayISO();
  const horizon = isoDate(addDays(parseDate(today), 365));
  const occs = getOccurrencesBetween(template, today, horizon);
  return occs[0] ?? null;
}
