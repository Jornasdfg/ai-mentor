import type { CalendarProvider } from "./types";
import { LocalCalendarProvider } from "./localCalendarProvider";
import { CalendarMcpProvider } from "./calendarMcpProvider";
import { GoogleCalendarProvider } from "./googleCalendarProvider";

export function getCalendarProvider(): CalendarProvider {
  const mode = process.env.CALENDAR_PROVIDER ?? "local";

  if (mode === "google") {
    return new GoogleCalendarProvider();
  }

  if (mode === "calendarmcp") {
    return new CalendarMcpProvider({
      endpoint: process.env.CALENDAR_MCP_ENDPOINT ?? "",
      apiKey: process.env.CALENDAR_MCP_API_KEY ?? "",
    });
  }

  return new LocalCalendarProvider();
}
