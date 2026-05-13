import { NextResponse } from "next/server";
import { processPendingCalendarJobs } from "@/lib/calendar/calendarOutbox";
import { getCalendarProvider } from "@/lib/calendar/calendarProvider";

export async function POST() {
  try {
    const provider = getCalendarProvider();
    const result = await processPendingCalendarJobs(provider);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Outbox verwerking mislukt" },
      { status: 500 }
    );
  }
}
