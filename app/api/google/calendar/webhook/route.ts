import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { readChannels, appendSyncLog } from "@/lib/calendar/googleSyncStorage";
import { incrementalSyncCalendar } from "@/lib/calendar/googleSyncEngine";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";

export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id") ?? "";
  const channelToken = req.headers.get("x-goog-channel-token") ?? "";
  const resourceId = req.headers.get("x-goog-resource-id") ?? "";
  const resourceState = req.headers.get("x-goog-resource-state") ?? "";
  const messageNumber = req.headers.get("x-goog-message-number") ?? "";

  if (!channelId) return new NextResponse(null, { status: 204 });

  const channels = await readChannels();
  const channel = channels.find(c => c.id === channelId && c.active);

  if (!channel) {
    await appendSyncLog("webhook", "unknown", `Onbekend channel: ${channelId} — genegeerd`);
    return new NextResponse(null, { status: 204 });
  }

  if (channelToken) {
    const receivedHash = crypto.createHash("sha256").update(channelToken).digest("hex");
    if (receivedHash !== channel.tokenHash) {
      await appendSyncLog("webhook", channel.calendarId, `Token validatie mislukt voor channel ${channelId}`);
      return new NextResponse(null, { status: 204 });
    }
  }

  if (resourceState === "sync") {
    await appendSyncLog("webhook", channel.calendarId, `Sync ping (message #${messageNumber})`);
    return new NextResponse(null, { status: 204 });
  }

  if (resourceState === "exists" || resourceState === "not_exists") {
    await appendSyncLog(
      "webhook", channel.calendarId,
      `Webhook ${resourceState}, message #${messageNumber}, resource: ${resourceId}`
    );

    // Fire-and-forget: incremental sync + reschedule
    // External Google events update busy blocks → scheduler recalculates
    Promise.resolve()
      .then(() => incrementalSyncCalendar(channel.calendarId))
      .then(() => recalculateSchedule({ triggeredBy: "google_webhook", horizonDays: 28, syncToGoogle: false }))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Onbekend";
        appendSyncLog("error", channel.calendarId, `Webhook sync/reschedule fout: ${msg}`).catch(() => {});
      });
  }

  return new NextResponse(null, { status: 204 });
}