import * as fs from "fs/promises";
import * as path from "path";
import type { CalendarProvider } from "./types";
import { readTasks, writeTasks } from "@/lib/mentor/mentorStorage";
import { isInvalidGrant, markGoogleReauthNeeded } from "./googleTokenStorage";

const DATA_DIR = path.join(process.cwd(), "data");
const OUTBOX_FILE = path.join(DATA_DIR, "calendar_outbox.json");
const MAX_ATTEMPTS = 5;

export interface CalendarOutboxJob {
  id: string;
  type: "create_event" | "update_event" | "delete_event";
  taskId: string;
  calendarId: string;
  eventId?: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "done" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
}

// Exponential backoff delays: attempt 0=immediate, 1=1min, 2=5min, 3=30min, 4=2h
function backoffMs(attempt: number): number {
  const delays = [0, 60_000, 300_000, 1_800_000, 7_200_000];
  return delays[Math.min(attempt, delays.length - 1)];
}

// ─── Storage ──────────────────────────────────────────────────────────────────

async function readOutbox(): Promise<CalendarOutboxJob[]> {
  try {
    const raw = await fs.readFile(OUTBOX_FILE, "utf-8");
    return (JSON.parse(raw) as { jobs: CalendarOutboxJob[] }).jobs ?? [];
  } catch {
    return [];
  }
}

async function writeOutbox(jobs: CalendarOutboxJob[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(OUTBOX_FILE, JSON.stringify({ jobs }, null, 2), "utf-8");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueCalendarJob(
  type: CalendarOutboxJob["type"],
  taskId: string,
  calendarId: string,
  payload: Record<string, unknown>,
  eventId?: string
): Promise<CalendarOutboxJob> {
  const jobs = await readOutbox();

  // Idempotency: skip if pending/processing job exists for same task+type
  const existing = jobs.find(
    j => j.taskId === taskId && j.type === type &&
         (j.status === "pending" || j.status === "processing")
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const job: CalendarOutboxJob = {
    id: `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    taskId,
    calendarId,
    eventId,
    payload,
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: now,
  };
  jobs.push(job);
  await writeOutbox(jobs);
  return job;
}

export async function processPendingCalendarJobs(
  provider: CalendarProvider
): Promise<{ processed: number; failed: number; skipped: number }> {
  const jobs = await readOutbox();
  const now = Date.now();
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  // Mark eligible jobs as processing
  const toProcess: CalendarOutboxJob[] = [];
  for (const job of jobs) {
    if (job.status !== "pending") { skipped++; continue; }
    if (new Date(job.nextAttemptAt).getTime() > now) { skipped++; continue; }
    job.status = "processing";
    job.attempts++;
    job.updatedAt = new Date().toISOString();
    toProcess.push(job);
  }
  if (toProcess.length > 0) await writeOutbox(jobs);

  // Execute each job
  for (const job of toProcess) {
    try {
      if (job.type === "create_event") {
        const result = await provider.createEvent(job.payload as unknown as Parameters<CalendarProvider["createEvent"]>[0]);
        // Persist calendarLink back to task
        const tasks = await readTasks();
        const idx = tasks.findIndex(t => t.id === job.taskId);
        if (idx !== -1) {
          tasks[idx] = {
            ...tasks[idx],
            calendarLink: {
              provider: "google",
              calendarId: result.calendarId,
              eventId: result.eventId,
              htmlLink: result.htmlLink ?? null,
              lastSyncedAt: new Date().toISOString(),
              syncStatus: "synced",
              syncError: null,
            },
            updatedAt: new Date().toISOString(),
          };
          await writeTasks(tasks);
        }

      } else if (job.type === "update_event" && job.eventId) {
        await provider.updateEvent({
          ...(job.payload as Record<string, unknown>),
          eventId: job.eventId,
          calendarId: job.calendarId,
        } as Parameters<CalendarProvider["updateEvent"]>[0]);
        // Update lastSyncedAt on task
        const tasks = await readTasks();
        const idx = tasks.findIndex(t => t.id === job.taskId);
        if (idx !== -1 && tasks[idx].calendarLink) {
          tasks[idx] = {
            ...tasks[idx],
            calendarLink: {
              ...tasks[idx].calendarLink!,
              lastSyncedAt: new Date().toISOString(),
              syncStatus: "synced",
              syncError: null,
            },
            updatedAt: new Date().toISOString(),
          };
          await writeTasks(tasks);
        }

      } else if (job.type === "delete_event" && job.eventId) {
        await provider.deleteEvent({ eventId: job.eventId, calendarId: job.calendarId });
      }

      job.status = "done";
      job.lastError = null;
      job.updatedAt = new Date().toISOString();
      processed++;

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      job.lastError = msg.slice(0, 300);
      job.updatedAt = new Date().toISOString();

      if (isInvalidGrant(err)) {
        // Auth verlopen: tel dit NIET als echte poging. Bewaar de job zodat hij na
        // herkoppelen alsnog wordt verstuurd (geen verlies van afspraken).
        job.attempts = Math.max(0, job.attempts - 1);
        job.status = "pending";
        job.nextAttemptAt = new Date(Date.now() + 300_000).toISOString();
        await markGoogleReauthNeeded();
        skipped++;
      } else if (job.attempts >= MAX_ATTEMPTS) {
        job.status = "failed";
        failed++;
      } else {
        job.status = "pending";
        job.nextAttemptAt = new Date(Date.now() + backoffMs(job.attempts)).toISOString();
        skipped++;
      }
    }
  }

  if (toProcess.length > 0) await writeOutbox(jobs);
  return { processed, failed, skipped };
}

export async function markJobDone(jobId: string): Promise<void> {
  const jobs = await readOutbox();
  const idx = jobs.findIndex(j => j.id === jobId);
  if (idx !== -1) {
    jobs[idx] = { ...jobs[idx], status: "done", updatedAt: new Date().toISOString() };
    await writeOutbox(jobs);
  }
}

export async function markJobFailed(jobId: string, reason: string): Promise<void> {
  const jobs = await readOutbox();
  const idx = jobs.findIndex(j => j.id === jobId);
  if (idx !== -1) {
    jobs[idx] = {
      ...jobs[idx],
      status: "failed",
      lastError: reason.slice(0, 300),
      updatedAt: new Date().toISOString(),
    };
    await writeOutbox(jobs);
  }
}

// Na herkoppelen: revive afspraak-jobs die eerder strandden op een auth-/tokenfout,
// zodat ze alsnog naar Google worden gepusht.
export async function requeueFailedAuthJobs(): Promise<number> {
  const jobs = await readOutbox();
  let n = 0;
  const nowISO = new Date().toISOString();
  for (const j of jobs) {
    if (j.status === "failed" && /invalid_grant|unauthor|401|403|token|gekoppeld/i.test(j.lastError ?? "")) {
      j.status = "pending";
      j.attempts = 0;
      j.lastError = null;
      j.nextAttemptAt = nowISO;
      j.updatedAt = nowISO;
      n++;
    }
  }
  if (n > 0) await writeOutbox(jobs);
  return n;
}

export async function getOutboxStatus(): Promise<{
  pending: number;
  processing: number;
  done: number;
  failed: number;
  recent: CalendarOutboxJob[];
}> {
  const jobs = await readOutbox();
  return {
    pending: jobs.filter(j => j.status === "pending").length,
    processing: jobs.filter(j => j.status === "processing").length,
    done: jobs.filter(j => j.status === "done").length,
    failed: jobs.filter(j => j.status === "failed").length,
    recent: [...jobs].reverse().slice(0, 20),
  };
}
