import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { readGoogleTokens, writeGoogleTokens, isInvalidGrant, markGoogleReauthNeeded } from "./googleTokenStorage";
import {
  readSyncState,
  writeSyncState,
  upsertCachedEvents,
  appendSyncLog,
  type CachedEvent,
} from "./googleSyncStorage";

const DEFAULT_CALENDAR_ID = process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";
const FULL_SYNC_DAYS_PAST = 90;
const FULL_SYNC_DAYS_FUTURE = 365;

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getAuthClient() {
  const tokens = await readGoogleTokens();
  if (!tokens?.connected || !tokens.refreshToken) {
    throw new Error("Google Calendar is nog niet gekoppeld.");
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
  oauth2Client.on("tokens", (creds) => {
    readGoogleTokens().then((cur) => {
      if (!cur) return;
      writeGoogleTokens({
        ...cur,
        accessToken: creds.access_token ?? cur.accessToken,
        expiryDate: creds.expiry_date ?? cur.expiryDate,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }).catch(() => {});
  });
  return oauth2Client;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function mapEvent(e: calendar_v3.Schema$Event, calendarId: string): CachedEvent {
  return {
    calendarId,
    eventId: e.id ?? "",
    iCalUID: e.iCalUID ?? "",
    etag: e.etag ?? "",
    status: (e.status as CachedEvent["status"]) ?? "confirmed",
    summary: e.summary ?? "",
    description: e.description ?? null,
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    updated: e.updated ?? "",
    htmlLink: e.htmlLink ?? null,
    extendedProperties: (e.extendedProperties as Record<string, Record<string, string>>) ?? null,
    raw: e as unknown as Record<string, unknown>,
    lastSeenAt: new Date().toISOString(),
  };
}

// ─── Full sync ────────────────────────────────────────────────────────────────

export interface SyncResult {
  fullSync: boolean;
  changed: number;
  deleted: number;
  nextSyncTokenUpdated: boolean;
}

export async function fullSyncCalendar(
  calendarId: string = DEFAULT_CALENDAR_ID
): Promise<SyncResult> {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const timeMin = new Date(now.getTime() - FULL_SYNC_DAYS_PAST * 86_400_000).toISOString();
  const timeMax = new Date(now.getTime() + FULL_SYNC_DAYS_FUTURE * 86_400_000).toISOString();

  const allEvents: CachedEvent[] = [];
  let nextPageToken: string | undefined;
  let nextSyncToken: string | undefined;

  try {
    do {
      const res = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        pageToken: nextPageToken,
      });
      for (const e of res.data.items ?? []) allEvents.push(mapEvent(e, calendarId));
      nextPageToken = res.data.nextPageToken ?? undefined;
      nextSyncToken = res.data.nextSyncToken ?? undefined;
    } while (nextPageToken);
  } catch (err: unknown) {
    if (isInvalidGrant(err)) {
      await markGoogleReauthNeeded();
      await writeSyncState(calendarId, { lastError: "invalid_grant — Google opnieuw koppelen nodig" });
      await appendSyncLog("error", calendarId, "invalid_grant: refresh-token verlopen — koppel Google opnieuw via /api/auth/google/start");
    }
    throw err;
  }

  const { changed, deleted } = await upsertCachedEvents(allEvents);
  await writeSyncState(calendarId, {
    nextSyncToken: nextSyncToken ?? null,
    lastFullSyncAt: new Date().toISOString(),
    lastError: null,
  });
  await appendSyncLog(
    "full",
    calendarId,
    `Full sync: ${allEvents.length} events verwerkt, ${changed} gewijzigd, ${deleted} verwijderd`
  );

  return { fullSync: true, changed, deleted, nextSyncTokenUpdated: !!nextSyncToken };
}

// ─── Incremental sync ─────────────────────────────────────────────────────────

export async function incrementalSyncCalendar(
  calendarId: string = DEFAULT_CALENDAR_ID
): Promise<SyncResult> {
  const state = await readSyncState(calendarId);

  if (!state?.nextSyncToken) {
    await appendSyncLog("incremental", calendarId, "Geen syncToken aanwezig — full sync gestart");
    return fullSyncCalendar(calendarId);
  }

  const auth = await getAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const allEvents: CachedEvent[] = [];
  let nextPageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const syncToken = state.nextSyncToken;

  try {
    do {
      // syncToken only on first page; subsequent pages use pageToken only
      const res = await calendar.events.list({
        calendarId,
        syncToken: nextPageToken ? undefined : syncToken,
        pageToken: nextPageToken,
        showDeleted: true,
        maxResults: 250,
      });
      for (const e of res.data.items ?? []) allEvents.push(mapEvent(e, calendarId));
      nextPageToken = res.data.nextPageToken ?? undefined;
      nextSyncToken = res.data.nextSyncToken ?? undefined;
    } while (nextPageToken);
  } catch (err: unknown) {
    // 410 Gone = syncToken expired, must full sync
    const status =
      (err as { response?: { status?: number } }).response?.status ??
      (err as { status?: number }).status ??
      (err as { code?: number }).code;

    if (status === 410) {
      await appendSyncLog("error", calendarId, "syncToken verlopen (410 Gone) — full sync gestart");
      await writeSyncState(calendarId, { nextSyncToken: null, lastError: "syncToken verlopen (410)" });
      return fullSyncCalendar(calendarId);
    }
    if (isInvalidGrant(err)) {
      await markGoogleReauthNeeded();
      await writeSyncState(calendarId, { lastError: "invalid_grant — Google opnieuw koppelen nodig" });
      await appendSyncLog("error", calendarId, "invalid_grant: refresh-token verlopen — koppel Google opnieuw via /api/auth/google/start");
      throw err;
    }
    const msg = err instanceof Error ? err.message : "Onbekende fout";
    await writeSyncState(calendarId, { lastError: msg });
    await appendSyncLog("error", calendarId, `Incremental sync fout: ${msg}`);
    throw err;
  }

  const { changed, deleted } = await upsertCachedEvents(allEvents);
  await writeSyncState(calendarId, {
    nextSyncToken: nextSyncToken ?? syncToken,
    lastIncrementalSyncAt: new Date().toISOString(),
    lastError: null,
  });
  await appendSyncLog(
    "incremental",
    calendarId,
    `Incremental sync: ${allEvents.length} events, ${changed} gewijzigd, ${deleted} verwijderd`
  );

  return { fullSync: false, changed, deleted, nextSyncTokenUpdated: !!nextSyncToken };
}
