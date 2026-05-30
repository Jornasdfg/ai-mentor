// mentor-worker — background scheduler
// Jobs:
//   outbox-process    — every 5 min
//   repair-sync       — every 15 min
//   scheduler-repair  — every 10 min
//   watch-ensure      — every 6 hours
//   daily-briefing    — every day at 07:30 Europe/Amsterdam

import cron from "node-cron";
import { processPendingCalendarJobs } from "@/lib/calendar/calendarOutbox";
import { getCalendarProvider } from "@/lib/calendar/calendarProvider";
import { ensureWatchActive } from "@/lib/calendar/googleWatchManager";
import { incrementalSyncCalendar, fullSyncCalendar } from "@/lib/calendar/googleSyncEngine";
import { syncCacheToTasks } from "@/lib/calendar/googleTaskSyncMapper";
import { readSyncState, appendSyncLog } from "@/lib/calendar/googleSyncStorage";
import { isGoogleConnected } from "@/lib/calendar/googleTokenStorage";
import { generateDailyBriefing } from "@/lib/briefing/dailyBriefing";
import { recalculateSchedule } from "@/lib/scheduler/autoScheduler";
import { readTasks, writeTasks } from "@/lib/mentor/mentorStorage";
import { dedupeTasks, writeDedupSuggestions } from "@/lib/mentor/taskDedup";

const CALENDAR_ID = process.env.GOOGLE_DEFAULT_CALENDAR_ID ?? "primary";

async function run(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`[worker] [${name}] start`);
  try {
    await fn();
    console.log(`[worker] [${name}] klaar`);
  } catch (err) {
    console.error(`[worker] [${name}] fout:`, err instanceof Error ? err.message : err);
  }
}

// ── Outbox: every 5 minutes ───────────────────────────────────────────────────
cron.schedule("*/5 * * * *", () => {
  run("outbox", async () => {
    if (!(await isGoogleConnected())) return;
    const provider = getCalendarProvider();
    const result = await processPendingCalendarJobs(provider);
    console.log(`[worker] [outbox] processed=${result.processed} failed=${result.failed} skipped=${result.skipped}`);
  });
});

// ── Repair sync: every 15 minutes ────────────────────────────────────────────
cron.schedule("*/15 * * * *", () => {
  run("repair-sync", async () => {
    if (!(await isGoogleConnected())) return;
    const syncState = await readSyncState(CALENDAR_ID);
    const needsFull = !syncState?.nextSyncToken;
    const syncResult = needsFull
      ? await fullSyncCalendar(CALENDAR_ID)
      : await incrementalSyncCalendar(CALENDAR_ID);
    const taskResult = await syncCacheToTasks();
    await appendSyncLog(
      "repair", CALENDAR_ID,
      `[worker] Repair (${syncResult.fullSync ? "full" : "incr"}): ` +
      `${syncResult.changed} gewijzigd, ${syncResult.deleted} verwijderd, tasks updated=${taskResult.updated}`
    );
  });
});

// ── Scheduler repair: every 10 minutes ───────────────────────────────────────
cron.schedule("*/10 * * * *", () => {
  run("scheduler-repair", async () => {
    const result = await recalculateSchedule({ triggeredBy: "worker_repair", horizonDays: 28, syncToGoogle: true });
    console.log(`[worker] [scheduler-repair] blocks=${result.run.blocksCreated} warnings=${result.warnings.length}`);
  });
});

// ── Dedup taken: every 17 minutes ────────────────────────────────────────────
cron.schedule("*/17 * * * *", () => {
  run("dedup", async () => {
    const tasks = await readTasks();
    const { tasks: deduped, mergedCount, suggestions } = dedupeTasks(tasks);
    await writeDedupSuggestions(suggestions);
    if (mergedCount > 0) {
      await writeTasks(deduped);
      await recalculateSchedule({ triggeredBy: "worker_repair", horizonDays: 28, syncToGoogle: true });
    }
    console.log(`[worker] [dedup] merged=${mergedCount} suggesties=${suggestions.length}`);
  });
});

// ── Watch ensure: every 6 hours ──────────────────────────────────────────────
cron.schedule("0 */6 * * *", () => {
  run("watch-ensure", async () => {
    if (!(await isGoogleConnected())) return;
    const result = await ensureWatchActive(CALENDAR_ID);
    console.log(`[worker] [watch-ensure] action=${result.action} channelId=${result.channel?.id ?? "none"}`);
  });
});

// ── Daily briefing: 07:30 Europe/Amsterdam ───────────────────────────────────
cron.schedule(
  "30 7 * * *",
  () => {
    run("daily-briefing", async () => {
      const briefing = await generateDailyBriefing();
      console.log(`[worker] [daily-briefing] date=${briefing.date} sentVia=${briefing.sentVia}`);
    });
  },
  { timezone: "Europe/Amsterdam" }
);

console.log("[worker] Gestart. Jobs: outbox/5m, repair-sync/15m, scheduler-repair/10m, dedup/17m, watch-ensure/6h, briefing/07:30 AMS");