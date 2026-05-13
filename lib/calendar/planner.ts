import type { MentorTask, CalendarEventView } from "@/lib/mentorTypes";

export function taskToCalendarView(task: MentorTask): CalendarEventView | null {
  if (!task.plannedStart || !task.plannedEnd) return null;

  return {
    id: `task_${task.id}`,
    title: task.title,
    start: task.plannedStart,
    end: task.plannedEnd,
    source: "mentor_task",
    taskId: task.id,
    calendarId: task.calendarLink?.calendarId ?? undefined,
    htmlLink: task.calendarLink?.htmlLink ?? null,
    description: task.nextAction ?? null,
  };
}

export function buildPlannerEvents(
  tasks: MentorTask[],
  googleEvents: CalendarEventView[]
): CalendarEventView[] {
  const activeTasks = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");

  const taskEvents = activeTasks
    .map(taskToCalendarView)
    .filter((e): e is CalendarEventView => e !== null);

  // Suppress Google events that are already represented by a task (imported via "Maak taak")
  const linkedEventIds = new Set(
    activeTasks.map(t => t.calendarLink?.eventId).filter(Boolean)
  );
  const deduplicatedGoogleEvents = googleEvents.filter(e => !linkedEventIds.has(e.id));

  return [...taskEvents, ...deduplicatedGoogleEvents].sort((a, b) => a.start.localeCompare(b.start));
}

export function getWeekRange(baseDateISO: string): { start: string; end: string } {
  const base = new Date(`${baseDateISO}T12:00:00`);
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dayNr = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dayNr}`;
  };

  return {
    start: fmt(monday),
    end: fmt(sunday),
  };
}
