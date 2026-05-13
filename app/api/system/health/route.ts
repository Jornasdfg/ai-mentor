import { NextResponse } from "next/server";
import { isGoogleConnected, isEncryptionEnabled } from "@/lib/calendar/googleTokenStorage";
import { getActiveChannels } from "@/lib/calendar/googleWatchManager";
import { readSyncState } from "@/lib/calendar/googleSyncStorage";

export async function GET() {
  const calendarId = process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";

  const [connected, activeChannels, syncState] = await Promise.all([
    isGoogleConnected().catch(() => false),
    getActiveChannels().catch(() => []),
    readSyncState(calendarId).catch(() => null),
  ]);

  const activeChannel = activeChannels[0] ?? null;
  const webhookConfigured = !!process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  const tokensEncrypted = isEncryptionEnabled();
  const provider = process.env.CALENDAR_PROVIDER ?? "local";

  const warnings: string[] = [];
  if (!tokensEncrypted) {
    warnings.push("tokens not encrypted — set GOOGLE_TOKEN_ENCRYPTION_KEY for production");
  }
  if (!webhookConfigured && connected) {
    warnings.push("GOOGLE_CALENDAR_WEBHOOK_URL not set — push notifications disabled");
  }
  if (!process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET && connected) {
    warnings.push("GOOGLE_CALENDAR_WEBHOOK_SECRET not set — webhook security disabled");
  }

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    app: {
      provider,
      storageMode: "json",
      dataDir: process.env.DATA_DIR ?? "data",
    },
    google: {
      connected,
      webhookConfigured,
      tokensEncrypted,
      watchActive: activeChannels.length > 0,
      watchChannelCount: activeChannels.length,
      watchExpiration: activeChannel
        ? new Date(activeChannel.expiration).toISOString()
        : null,
      lastFullSync: syncState?.lastFullSyncAt ?? null,
      lastIncrementalSync: syncState?.lastIncrementalSyncAt ?? null,
      lastError: syncState?.lastError ?? null,
      syncTokenPresent: !!syncState?.nextSyncToken,
    },
    warnings,
  });
}
