import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

// Starts the Google OAuth flow by redirecting to Google's consent screen.
// State is stored server-side in data/oauth_state.json for CSRF protection.
// Local single-user dev implementation — no session management needed.

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "oauth_state.json");

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const calendarScope =
    process.env.GOOGLE_CALENDAR_SCOPES ??
    "https://www.googleapis.com/auth/calendar.events";
  // Gmail-leesrecht erbij: de app haalt factuur-PDF's (bijlagen) op om bedragen te lezen.
  const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";
  const scopes = `${calendarScope} ${gmailScope}`;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID of GOOGLE_REDIRECT_URI ontbreekt in .env.local" },
      { status: 500 }
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    STATE_FILE,
    JSON.stringify({ state, createdAt: new Date().toISOString() }),
    "utf-8"
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    include_granted_scopes: "true",
    // prompt=consent ensures a refresh_token is returned every time.
    // Remove after confirmed working in production.
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
