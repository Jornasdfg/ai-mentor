import { NextResponse } from "next/server";
import { getOutboxStatus } from "@/lib/calendar/calendarOutbox";

export async function GET() {
  try {
    const status = await getOutboxStatus();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Outbox status ophalen mislukt" },
      { status: 500 }
    );
  }
}
