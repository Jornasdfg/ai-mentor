import * as fs from "fs/promises";
import * as path from "path";

// Local single-user dev storage for Google Calendar sync state.
// All files are excluded from git via .gitignore.

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR ?? "data");

const SYNC_STATE_FILE = path.join(DATA_DIR, "google_calendar_sync_state.json");
const CHANNELS_FILE = path.join(DATA_DIR, "google_calendar_channels.json");
const EVENT_CACHE_FILE = path.join(DATA_DIR, "google_calendar_event_cache.json");
const SYNC_LOG_FILE = path.join(DATA_DIR, "google_calendar_sync_log.json");

const MAX_LOG_ENTRIES = 200;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalendarSyncState {
  calendarId: string;
  nextSyncToken: string | null;
  lastFullSyncAt: string | null;
  lastIncrementalSyncAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
}

export interface WatchChannel {
  id: string;
  calendarId: string;
  resourceId: string;
  resourceUri: string;
  // SHA-256 of the channel token. The token itself is never stored.
  tokenHash: string;
  expiration: number; // Unix ms
  webhookUrl: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CachedEvent {
  calendarId: string;
  eventId: string;
  iCalUID: string;
  etag: string;
  status: "confirmed" | "cancelled" | "tentative";
  summary: string;
  description: string | null;
  start: string;
  end: string;
  updated: string;
  htmlLink: string | null;
  extendedProperties: Record<string, Record<string, string>> | null;
  raw: Record<string, unknown>;
  lastSeenAt: string;
}

export interface SyncLogItem {
  id: string;
  type: "full" | "incremental" | "webhook" | "repair" | "watch_start" | "watch_stop" | "watch_renew" | "ensure" | "error";
  calendarId: string;
  message: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// ─── Sync state ───────────────────────────────────────────────────────────────

export async function readSyncStates(): Promise<Record<string, CalendarSyncState>> {
  try {
    const raw = await fs.readFile(SYNC_STATE_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, CalendarSyncState>;
  } catch {
    return {};
  }
}

export async function readSyncState(calendarId: string): Promise<CalendarSyncState | null> {
  const states = await readSyncStates();
  return states[calendarId] ?? null;
}

export async function writeSyncState(
  calendarId: string,
  patch: Partial<CalendarSyncState>
): Promise<CalendarSyncState> {
  await ensureDataDir();
  const states = await readSyncStates();
  const existing: CalendarSyncState = states[calendarId] ?? {
    calendarId,
    nextSyncToken: null,
    lastFullSyncAt: null,
    lastIncrementalSyncAt: null,
    lastError: null,
    updatedAt: null,
  };
  const updated: CalendarSyncState = {
    ...existing,
    ...patch,
    calendarId,
    updatedAt: new Date().toISOString(),
  };
  states[calendarId] = updated;
  await fs.writeFile(SYNC_STATE_FILE, JSON.stringify(states, null, 2), "utf-8");
  return updated;
}

// ─── Watch channels ───────────────────────────────────────────────────────────

export async function readChannels(): Promise<WatchChannel[]> {
  try {
    const raw = await fs.readFile(CHANNELS_FILE, "utf-8");
    return (JSON.parse(raw) as { channels: WatchChannel[] }).channels ?? [];
  } catch {
    return [];
  }
}

export async function writeChannels(channels: WatchChannel[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CHANNELS_FILE, JSON.stringify({ channels }, null, 2), "utf-8");
}

export async function upsertChannel(channel: WatchChannel): Promise<void> {
  const channels = await readChannels();
  const idx = channels.findIndex(c => c.id === channel.id);
  if (idx === -1) channels.push(channel);
  else channels[idx] = channel;
  await writeChannels(channels);
}

// ─── Event cache ──────────────────────────────────────────────────────────────

export async function readEventCache(): Promise<CachedEvent[]> {
  try {
    const raw = await fs.readFile(EVENT_CACHE_FILE, "utf-8");
    return (JSON.parse(raw) as { events: CachedEvent[] }).events ?? [];
  } catch {
    return [];
  }
}

export async function writeEventCache(events: CachedEvent[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(EVENT_CACHE_FILE, JSON.stringify({ events }, null, 2), "utf-8");
}

export async function upsertCachedEvents(
  incoming: CachedEvent[]
): Promise<{ changed: number; deleted: number }> {
  const existing = await readEventCache();
  const byKey = new Map(existing.map(e => [`${e.calendarId}:${e.eventId}`, e]));
  let changed = 0;
  let deleted = 0;

  for (const ev of incoming) {
    const key = `${ev.calendarId}:${ev.eventId}`;
    const prev = byKey.get(key);
    if (ev.status === "cancelled") {
      deleted++;
    } else if (!prev || prev.etag !== ev.etag) {
      changed++;
    }
    byKey.set(key, ev);
  }

  await writeEventCache(Array.from(byKey.values()));
  return { changed, deleted };
}

// ─── Sync log ─────────────────────────────────────────────────────────────────

export async function readSyncLog(): Promise<SyncLogItem[]> {
  try {
    const raw = await fs.readFile(SYNC_LOG_FILE, "utf-8");
    return (JSON.parse(raw) as { items: SyncLogItem[] }).items ?? [];
  } catch {
    return [];
  }
}

export async function appendSyncLog(
  type: SyncLogItem["type"],
  calendarId: string,
  message: string
): Promise<void> {
  await ensureDataDir();
  const items = await readSyncLog();
  items.unshift({
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    calendarId,
    message,
    createdAt: new Date().toISOString(),
  });
  if (items.length > MAX_LOG_ENTRIES) items.splice(MAX_LOG_ENTRIES);
  await fs.writeFile(SYNC_LOG_FILE, JSON.stringify({ items }, null, 2), "utf-8");
}
