import * as crypto from "crypto";
import { google } from "googleapis";
import { readGoogleTokens, writeGoogleTokens } from "./googleTokenStorage";
import {
  readChannels,
  writeChannels,
  upsertChannel,
  appendSyncLog,
  type WatchChannel,
} from "./googleSyncStorage";

const DEFAULT_CALENDAR_ID = process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";
const RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1_000; // 24 hours

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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getActiveChannels(): Promise<WatchChannel[]> {
  const channels = await readChannels();
  return channels.filter(c => c.active && c.expiration > Date.now());
}

export async function startWatch(calendarId: string = DEFAULT_CALENDAR_ID): Promise<WatchChannel> {
  const webhookUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("GOOGLE_CALENDAR_WEBHOOK_URL is niet ingesteld in .env.local");
  }

  // Skip if a valid channel already exists that won't expire within RENEW_THRESHOLD
  const existing = (await getActiveChannels()).find(
    c =>
      c.calendarId === calendarId &&
      c.webhookUrl === webhookUrl &&
      c.expiration > Date.now() + RENEW_THRESHOLD_MS
  );
  if (existing) {
    await appendSyncLog(
      "watch_start",
      calendarId,
      `Actieve channel bestaat al (id: ${existing.id}) — niets gestart`
    );
    return existing;
  }

  const auth = await getAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const channelId = crypto.randomUUID();
  const ttl = parseInt(process.env.GOOGLE_CALENDAR_WATCH_TTL_SECONDS ?? "604800", 10);
  const secret = process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET ?? "";

  const channelToken = crypto.createHmac("sha256", secret).update(channelId).digest("hex");
  const tokenHash = crypto.createHash("sha256").update(channelToken).digest("hex");

  const response = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: webhookUrl,
      token: channelToken,
      params: { ttl: String(ttl) },
    },
  });

  const now = new Date().toISOString();
  const channel: WatchChannel = {
    id: channelId,
    calendarId,
    resourceId: response.data.resourceId ?? "",
    resourceUri: response.data.resourceUri ?? "",
    tokenHash,
    expiration: parseInt(String(response.data.expiration ?? "0"), 10),
    webhookUrl,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await upsertChannel(channel);
  await appendSyncLog(
    "watch_start",
    calendarId,
    `Watch channel gestart (id: ${channelId}), vervalt: ${new Date(channel.expiration).toISOString()}`
  );
  return channel;
}

// Stop a single channel by its stored ID (looks up resourceId from storage)
export async function stopChannel(channelId: string): Promise<void> {
  const channels = await readChannels();
  const channel = channels.find(c => c.id === channelId);
  if (!channel) return;

  try {
    const auth = await getAuthClient();
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.channels.stop({
      requestBody: { id: channelId, resourceId: channel.resourceId },
    });
  } catch (err) {
    const status =
      (err as { response?: { status?: number } }).response?.status ??
      (err as { code?: number }).code;
    // 404 = already stopped — not an error
    if (status !== 404) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      await appendSyncLog("watch_stop", channel.calendarId, `Channel stop waarschuwing: ${msg}`);
    }
  }

  const idx = channels.findIndex(c => c.id === channelId);
  if (idx !== -1) {
    channels[idx] = { ...channels[idx], active: false, updatedAt: new Date().toISOString() };
    await writeChannels(channels);
  }
  await appendSyncLog("watch_stop", channel.calendarId, `Watch channel gestopt (id: ${channelId})`);
}

// Legacy alias kept for internal use
export async function stopWatch(channelId: string, _resourceId: string): Promise<void> {
  return stopChannel(channelId);
}

export async function renewWatchesIfNeeded(): Promise<{ renewed: number; skipped: number }> {
  const channels = await readChannels();
  const now = Date.now();
  let renewed = 0;
  let skipped = 0;
  const toDeactivate: string[] = [];

  for (const channel of channels) {
    if (!channel.active || channel.expiration <= now) { skipped++; continue; }

    if (channel.expiration - now < RENEW_THRESHOLD_MS) {
      try {
        // Start new channel first (prevents coverage gap)
        await startWatch(channel.calendarId);
        toDeactivate.push(channel.id);
        // Attempt to stop old channel at Google — non-fatal if it fails
        try {
          const auth = await getAuthClient();
          const cal = google.calendar({ version: "v3", auth });
          await cal.channels.stop({
            requestBody: { id: channel.id, resourceId: channel.resourceId },
          });
        } catch { /* will expire naturally */ }
        await appendSyncLog(
          "watch_renew",
          channel.calendarId,
          `Channel vernieuwd (oud id: ${channel.id})`
        );
        renewed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Onbekende fout";
        await appendSyncLog("error", channel.calendarId, `Channel renew mislukt: ${msg}`);
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  // Re-read channels (startWatch wrote new ones) and mark old ones inactive
  if (toDeactivate.length > 0) {
    const fresh = await readChannels();
    for (const ch of fresh) {
      if (toDeactivate.includes(ch.id)) {
        ch.active = false;
        ch.updatedAt = new Date().toISOString();
      }
    }
    await writeChannels(fresh);
  }

  return { renewed, skipped };
}

// Ensures an active, non-expiring channel exists. Starts or renews as needed.
// Also replaces the channel if GOOGLE_CALENDAR_WEBHOOK_URL changed.
export async function ensureWatchActive(
  calendarId: string = DEFAULT_CALENDAR_ID
): Promise<{ action: "none" | "started" | "renewed" | "replaced"; channel: WatchChannel | null }> {
  const currentWebhookUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  if (!currentWebhookUrl) {
    throw new Error("GOOGLE_CALENDAR_WEBHOOK_URL is niet ingesteld");
  }

  const allChannels = await readChannels();
  const now = Date.now();
  const activeForCalendar = allChannels.filter(
    c => c.active && c.calendarId === calendarId && c.expiration > now
  );

  if (activeForCalendar.length === 0) {
    const channel = await startWatch(calendarId);
    await appendSyncLog("ensure", calendarId, `Ensure: geen actieve channel, nieuw gestart`);
    return { action: "started", channel };
  }

  // Webhook URL changed → stop all old channels and start fresh
  const urlChanged = activeForCalendar.some(c => c.webhookUrl !== currentWebhookUrl);
  if (urlChanged) {
    for (const ch of activeForCalendar) {
      await stopChannel(ch.id);
    }
    await appendSyncLog("ensure", calendarId, `Ensure: webhook URL veranderd — nieuw channel gestart`);
    const channel = await startWatch(calendarId);
    return { action: "replaced", channel };
  }

  // Any channel expiring within threshold → renew
  const anyExpiringSoon = activeForCalendar.some(
    c => c.expiration - now < RENEW_THRESHOLD_MS
  );
  if (anyExpiringSoon) {
    const { renewed } = await renewWatchesIfNeeded();
    if (renewed > 0) {
      const updated = await getActiveChannels();
      await appendSyncLog("ensure", calendarId, `Ensure: channel vernieuwd`);
      return { action: "renewed", channel: updated[0] ?? null };
    }
  }

  return { action: "none", channel: activeForCalendar[0] };
}
