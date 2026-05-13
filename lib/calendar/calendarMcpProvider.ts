import type { CalendarProvider, CalendarCreateInput, CalendarUpdateInput } from "./types";
import type { CalendarEventView } from "@/lib/mentorTypes";

interface McpConfig {
  endpoint: string;
  apiKey: string;
}

export class CalendarMcpProvider implements CalendarProvider {
  readonly name = "calendarmcp" as const;

  constructor(private config: McpConfig) {}

  private async callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
    if (!this.config.endpoint || !this.config.apiKey) {
      throw new Error("CalendarMCP is niet geconfigureerd. Zet CALENDAR_MCP_ENDPOINT en CALENDAR_MCP_API_KEY.");
    }

    const res = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `mentor_${Date.now()}`,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CalendarMCP fout ${res.status}: ${text}`);
    }

    const json = await res.json() as { error?: { message?: string }; result: T };

    if (json.error) {
      throw new Error(json.error.message ?? "Onbekende CalendarMCP fout");
    }

    return json.result;
  }

  async listEvents(args: {
    timeMin: string;
    timeMax: string;
    calendarId?: string;
  }): Promise<CalendarEventView[]> {
    const result = await this.callTool<Record<string, unknown>>("list_events", {
      calendarId: args.calendarId ?? "primary",
      timeMin: args.timeMin,
      timeMax: args.timeMax,
    });

    const rawEvents = (result.events ?? result.content ?? result.items ?? []) as Record<string, unknown>[];

    return rawEvents.map(e => ({
      id: String(e.id ?? e.eventId),
      title: String(e.summary ?? e.title ?? "Agenda-event"),
      start: String((e.start as Record<string, unknown>)?.dateTime ?? (e.start as Record<string, unknown>)?.date ?? e.start),
      end: String((e.end as Record<string, unknown>)?.dateTime ?? (e.end as Record<string, unknown>)?.date ?? e.end),
      allDay: Boolean((e.start as Record<string, unknown>)?.date && !(e.start as Record<string, unknown>)?.dateTime),
      source: "google_calendar" as const,
      calendarId: args.calendarId ?? "primary",
      htmlLink: (e.htmlLink as string) ?? null,
      status: e.status as string | undefined,
      description: (e.description as string) ?? null,
    }));
  }

  async createEvent(input: CalendarCreateInput): Promise<{
    eventId: string;
    calendarId: string;
    htmlLink?: string | null;
  }> {
    const result = await this.callTool<Record<string, unknown>>("create_event", {
      calendarId: input.calendarId ?? "primary",
      summary: input.title,
      description: input.description,
      location: input.location,
      start: {
        dateTime: input.start,
        timeZone: input.timeZone,
      },
      end: {
        dateTime: input.end,
        timeZone: input.timeZone,
      },
    });

    const event = (result.event ?? result) as Record<string, unknown>;

    return {
      eventId: String(event.id ?? event.eventId),
      calendarId: input.calendarId ?? "primary",
      htmlLink: (event.htmlLink as string) ?? null,
    };
  }

  async updateEvent(input: CalendarUpdateInput): Promise<{
    eventId: string;
    calendarId: string;
    htmlLink?: string | null;
  }> {
    const result = await this.callTool<Record<string, unknown>>("update_event", {
      calendarId: input.calendarId ?? "primary",
      eventId: input.eventId,
      summary: input.title,
      description: input.description,
      location: input.location,
      start: input.start
        ? { dateTime: input.start, timeZone: input.timeZone ?? "Europe/Amsterdam" }
        : undefined,
      end: input.end
        ? { dateTime: input.end, timeZone: input.timeZone ?? "Europe/Amsterdam" }
        : undefined,
    });

    const event = (result.event ?? result) as Record<string, unknown>;

    return {
      eventId: String(event.id ?? input.eventId),
      calendarId: input.calendarId ?? "primary",
      htmlLink: (event.htmlLink as string) ?? null,
    };
  }

  async deleteEvent(args: { eventId: string; calendarId?: string }): Promise<void> {
    await this.callTool("delete_event", {
      calendarId: args.calendarId ?? "primary",
      eventId: args.eventId,
    });
  }
}
