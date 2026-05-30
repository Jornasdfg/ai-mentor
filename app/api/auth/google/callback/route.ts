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

  const baseUrl = process.env.APP_BASE_URL ?? new URL(req.url).origin;

  if (errorParam) {
    console.warn("[google/callback] Google gaf een fout terug:", errorParam);
    return NextResponse.redirect(
      new URL(`/?calendarError=${encodeURIComponent(errorParam)}`, baseUrl)
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

  console.log("[google/callback] Google Calendar gekoppeld. Scope:", tokenData.scope);

  // Direct flawless: meteen volledige sync + taken-mapping + watch + afspraken pushen,
  // zodat de koppeling live is op het moment van koppelen (geen wachten op de worker).
  // Fire-and-forget — blokkeert de redirect niet.
  (async () => {
    try {
      const calId = process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";
      const [{ fullSyncCalendar }, { syncCacheToTasks }, { ensureWatchActive }, { recalculateSchedule }] = await Promise.all([
        import("@/lib/calendar/googleSyncEngine"),
        import("@/lib/calendar/googleTaskSyncMapper"),
        import("@/lib/calendar/googleWatchManager"),
        import("@/lib/scheduler/autoScheduler"),
      ]);
      await fullSyncCalendar(calId);
      await syncCacheToTasks();
      await ensureWatchActive(calId).catch(() => {}); // watch vereist HTTPS-webhook; niet blokkerend
      await recalculateSchedule({ triggeredBy: "manual", horizonDays: 28, syncToGoogle: true });
      console.log("[google/callback] Init-sync + afspraken push voltooid.");
    } catch (e) {
      console.error("[google/callback] init-sync fout:", e instanceof Error ? e.message : e);
    }
  })();

  return NextResponse.redirect(new URL("/?calendarConnected=1", baseUrl));
}
