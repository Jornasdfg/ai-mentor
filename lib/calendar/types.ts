import type { MentorTask, CalendarEventView } from "@/lib/mentorTypes";

export interface CalendarCreateInput {
  title: string;
  description?: string;
  start: string;
  end: string;
  timeZone: string;
  calendarId?: string;
  location?: string;
  taskId?: string;
}

export interface CalendarUpdateInput extends Partial<CalendarCreateInput> {
  eventId: string;
  calendarId?: string;
}

export interface CalendarProvider {
  readonly name: "local" | "calendarmcp" | "google";

  listEvents(args: {
    timeMin: string;
    timeMax: string;
    calendarId?: string;
  }): Promise<CalendarEventView[]>;

  createEvent(input: CalendarCreateInput): Promise<{
    eventId: string;
    calendarId: string;
    htmlLink?: string | null;
  }>;

  updateEvent(input: CalendarUpdateInput): Promise<{
    eventId: string;
    calendarId: string;
    htmlLink?: string | null;
  }>;

  deleteEvent(args: {
    eventId: string;
    calendarId?: string;
  }): Promise<void>;
}

export function taskToCalendarInput(task: MentorTask): CalendarCreateInput | null {
  if (!task.plannedStart || !task.plannedEnd) return null;

  const descriptionParts = [
    `AI Mentor taak`,
    task.project ? `Project: ${task.project}` : null,
    task.priority ? `Prioriteit: ${task.priority}` : null,
    task.coveyQuadrant ? `Covey: ${task.coveyQuadrant}` : null,
    task.nextAction ? `Volgende actie: ${task.nextAction}` : null,
    task.tags?.length ? `Tags: ${task.tags.join(", ")}` : null,
  ].filter(Boolean);

  return {
    title: task.title,
    description: descriptionParts.join("\n"),
    start: task.plannedStart,
    end: task.plannedEnd,
    timeZone: "Europe/Amsterdam",
    calendarId: task.calendarLink?.calendarId ?? "primary",
    taskId: task.id,
  };
}
