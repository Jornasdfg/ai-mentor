import { google } from "googleapis";
import type { CalendarProvider, CalendarCreateInput, CalendarUpdateInput } from "./types";
import type { CalendarEventView } from "@/lib/mentorTypes";
import { readGoogleTokens, writeGoogleTokens } from "./googleTokenStorage";

const CALENDAR_TIMEZONE = "Europe/Amsterdam";

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google" as const;

  private getDefaultCalendarId(): string {
    return process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";
  }

  private async getAuthClient() {
    const tokens = await readGoogleTokens();
    if (!tokens?.connected || !tokens.refreshToken) {
      throw new Error(
        "Google Calendar is nog niet gekoppeld. Ga naar /api/auth/google/start om te verbinden."
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiryDate,
    });

    // Persist refreshed tokens whenever googleapis auto-refreshes internally.
    // The 'tokens' event fires when the library obtains a new access token.
    // We save it without logging the values.
    oauth2Client.on("tokens", (newCreds) => {
      readGoogleTokens().then((current) => {
        if (!current) return;
        writeGoogleTokens({
          ...current,
          accessToken: newCreds.access_token ?? current.accessToken,
          expiryDate: newCreds.expiry_date ?? current.expiryDate,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }).catch(() => {});
    });

    return oauth2Client;
  }

  async listEvents(args: {
    timeMin: string;
    timeMax: string;
    calendarId?: string;
  }): Promise<CalendarEventView[]> {
    const auth = await this.getAuthClient();
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = args.calendarId ?? this.getDefaultCalendarId();

    const response = await calendar.events.list({
      calendarId,
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const items = response.data.items ?? [];

    return items
      .filter((e) => e.status !== "cancelled")
      .map((e) => ({
        id: e.id ?? "",
        title: e.summary ?? "Agenda-event",
        start: e.start?.dateTime ?? e.start?.date ?? "",
        end: e.end?.dateTime ?? e.end?.date ?? "",
        allDay: !e.start?.dateTime,
        source: "google_calendar" as const,
        calendarId,
        htmlLink: e.htmlLink ?? null,
        status: e.status ?? undefined,
        description: e.description ?? null,
      }));
  }

  async createEvent(input: CalendarCreateInput): Promise<{
    eventId: string;
    calendarId: string;
    htmlLink?: string | null;
  }> {
    const auth = await this.getAuthClient();
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = input.calendarId ?? this.getDefaultCalendarId();

    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: input.title,
        description: input.description,
        location: input.location,
        start: {
          dateTime: input.start,
          timeZone: input.timeZone ?? CALENDAR_TIMEZONE,
        },
        end: {
          dateTime: input.end,
          timeZone: input.timeZone ?? CALENDAR_TIMEZONE,
        },
        extendedProperties: {
          private: {
            aiMentorOrigin: "mentor",
            ...(input.taskId ? { aiMentorTaskId: input.taskId } : {}),
          },
        },
      },
    });

    return {
      eventId: response.data.id ?? "",
      calendarId,
      htmlLink: response.data.htmlLink ?? null,
    };
  }

  async updateEvent(input: CalendarUpdateInput): Promise<{
    eventId: string;
    calendarId: string;
    htmlLink?: string | null;
  }> {
    const auth = await this.getAuthClient();
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = input.calendarId ?? this.getDefaultCalendarId();

    // Use patch so we only overwrite the fields we provide — existing extendedProperties are preserved.
    const patchBody: Record<string, unknown> = {};
    if (input.title !== undefined) patchBody.summary = input.title;
    if (input.description !== undefined) patchBody.description = input.description;
    if (input.location !== undefined) patchBody.location = input.location;
    if (input.start !== undefined) {
      patchBody.start = { dateTime: input.start, timeZone: input.timeZone ?? CALENDAR_TIMEZONE };
    }
    if (input.end !== undefined) {
      patchBody.end = { dateTime: input.end, timeZone: input.timeZone ?? CALENDAR_TIMEZONE };
    }

    const response = await calendar.events.patch({
      calendarId,
      eventId: input.eventId,
      requestBody: patchBody,
    });

    return {
      eventId: response.data.id ?? input.eventId,
      calendarId,
      htmlLink: response.data.htmlLink ?? null,
    };
  }

  async deleteEvent(args: { eventId: string; calendarId?: string }): Promise<void> {
    const auth = await this.getAuthClient();
    const calendar = google.calendar({ version: "v3", auth });

    try {
      await calendar.events.delete({
        calendarId: args.calendarId ?? this.getDefaultCalendarId(),
        eventId: args.eventId,
      });
    } catch (err: unknown) {
      // 404 = event already deleted — treat as success
      const status = (err as { status?: number; response?: { status?: number } })?.response?.status
        ?? (err as { status?: number }).status;
      if (status === 404) return;
      throw err;
    }
  }
}
