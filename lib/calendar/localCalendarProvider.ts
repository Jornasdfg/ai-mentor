import type { CalendarProvider, CalendarCreateInput, CalendarUpdateInput } from "./types";
import type { CalendarEventView } from "@/lib/mentorTypes";

export class LocalCalendarProvider implements CalendarProvider {
  readonly name = "local" as const;

  async listEvents(): Promise<CalendarEventView[]> {
    return [];
  }

  async createEvent(_input: CalendarCreateInput): Promise<{ eventId: string; calendarId: string; htmlLink?: string | null }> {
    throw new Error("Google Calendar sync is nog niet geconfigureerd.");
  }

  async updateEvent(_input: CalendarUpdateInput): Promise<{ eventId: string; calendarId: string; htmlLink?: string | null }> {
    throw new Error("Google Calendar sync is nog niet geconfigureerd.");
  }

  async deleteEvent(_args: { eventId: string; calendarId?: string }): Promise<void> {
    throw new Error("Google Calendar sync is nog niet geconfigureerd.");
  }
}
