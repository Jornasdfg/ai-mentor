import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { writeGoogleTokens } from "@/lib/calendar/googleTokenStorage";

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR ?? "data");
const STATE_FILE = path.join(DATA_DIR, "oauth_state.json");

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    console.warn("[google/callback] Google gaf een fout terug:", errorParam);
    return NextResponse.redirect(
      new URL(`/?calendarError=${encodeURIComponent(errorParam)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.json({ error: "Geen authorization code ontvangen" }, { status: 400 });
  }

  // Verify state to prevent CSRF
  try {
    const raw = await fs.readFile(STATE_FILE, "utf-8");
    const saved = JSON.parse(raw) as { state: string };
    if (saved.state !== state) {
      return NextResponse.json({ error: "State mismatch — mogelijke CSRF aanval" }, { status: 400 });
    }
    await fs.unlink(STATE_FILE).catch(() => {});
  } catch {
    return NextResponse.json(
      { error: "State verificatie mislukt — probeer opnieuw via /api/auth/google/start" },
      { status: 400 }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "OAuth configuratie onvolledig in .env.local" }, { status: 500 });
  }

  // Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    // Log the status but not the body (may contain secrets)
    console.error("[google/callback] Token exchange mislukt, status:", tokenRes.status);
    return NextResponse.json(
      { error: `Token exchange mislukt (HTTP ${tokenRes.status})` },
      { status: 500 }
    );
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };

  if (!tokenData.refresh_token) {
    console.warn(
      "[google/callback] Geen refresh_token ontvangen. " +
      "Verwijder de app-toestemming via myaccount.google.com/permissions en probeer opnieuw."
    );
    return NextResponse.json(
      {
        error:
          "Google gaf geen refresh_token terug. Verwijder de app-toestemming in je Google-account " +
          "via myaccount.google.com/permissions en probeer opnieuw via /api/auth/google/start.",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  await writeGoogleTokens({
    provider: "google",
    connected: true,
    calendarId: process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary",
    scope: tokenData.scope,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiryDate: Date.now() + tokenData.expires_in * 1000,
    createdAt: now,
    updatedAt: now,
  });

  // Log success without exposing token values
  console.log("[google/callback] Google Calendar gekoppeld. Scope:", tokenData.scope);

  return NextResponse.redirect(new URL("/?calendarConnected=1", req.url));
}
