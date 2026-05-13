import { NextResponse } from "next/server";
import { isGoogleConnected } from "@/lib/calendar/googleTokenStorage";
import { readChannels, readSyncStates, readSyncLog } from "@/lib/calendar/googleSyncStorage";

export async function GET() {
  try {
    const connected = await isGoogleConnected();
    const allChannels = await readChannels();
    const syncStates = await readSyncStates();
    const recentLog = (await readSyncLog()).slice(0, 20);

    // Strip tokenHash — never expose to client
    const safeChannels = allChannels
      .filter(c => c.active && c.expiration > Date.now())
      .map(({ tokenHash: _stripped, ...rest }) => rest);

    return NextResponse.json({
      connected,
      activeChannels: safeChannels,
      syncState: syncStates,
      recentLog,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status ophalen mislukt" },
      { status: 500 }
    );
  }
}
