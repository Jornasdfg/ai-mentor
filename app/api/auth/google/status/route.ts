import { NextResponse } from "next/server";
import { isGoogleConnected, readGoogleTokens } from "@/lib/calendar/googleTokenStorage";

export async function GET() {
  const provider = process.env.CALENDAR_PROVIDER ?? "local";

  if (provider !== "google") {
    return NextResponse.json({ provider, googleEnabled: false, connected: false });
  }

  const connected = await isGoogleConnected();
  const tokens = connected ? await readGoogleTokens() : null;

  return NextResponse.json({
    provider,
    googleEnabled: true,
    connected,
    calendarId: tokens?.calendarId ?? null,
    scope: tokens?.scope ?? null,
    updatedAt: tokens?.updatedAt ?? null,
    // Never include access_token or refresh_token in the response
  });
}
