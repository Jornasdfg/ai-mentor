import { readEventCache, appendSyncLog } from "./googleSyncStorage";
import { readTasks, writeTasks } from "@/lib/mentor/mentorStorage";
import { saveConflictSnapshot } from "./googleConflictStorage";
import type { MentorTask } from "@/lib/mentorTypes";

export interface TaskSyncResult {
  updated: number;
  deletedRemote: number;
  conflicts: number;
  orphaned: number;
}

function isoMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  try { return new Date(iso).getTime(); } catch { return 0; }
}

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((isoMs(end) - isoMs(start)) / 60_000));
}

export async function syncCacheToTasks(): Promise<TaskSyncResult> {
  const [cachedEvents, tasks] = await Promise.all([readEventCache(), readTasks()]);
  const result: TaskSyncResult = { updated: 0, deletedRemote: 0, conflicts: 0, orphaned: 0 };
  const updatedTasks: MentorTask[] = [...tasks];
  const now = new Date().toISOString();
  let dirty = false;

  // Index tasks by eventId for fast lookup
  const taskByEventId = new Map<string, number>();
  tasks.forEach((t, i) => {
    if (t.calendarLink?.eventId) taskByEventId.set(t.calendarLink.eventId, i);
  });

  for (const event of cachedEvents) {
    const aiMentorTaskId = event.extendedProperties?.private?.aiMentorTaskId;

    // Find linked task: by aiMentorTaskId first, then by calendarLink.eventId
    let taskIndex = -1;
    if (aiMentorTaskId) {
      const idx = tasks.findIndex(t => t.id === aiMentorTaskId);
      if (idx === -1) {
        result.orphaned++;
        await appendSyncLog(
          "repair",
          event.calendarId,
          `Orphaned event: ${event.eventId} verwijst naar niet-bestaande taak ${aiMentorTaskId}`
        );
        continue;
      }
      taskIndex = idx;
    } else {
      taskIndex = taskByEventId.get(event.eventId) ?? -1;
    }

    if (taskIndex === -1) continue;
    const task = updatedTasks[taskIndex];

    // Event deleted/cancelled in Google Calendar
    if (event.status === "cancelled") {
      if (task.calendarLink?.syncStatus !== "deleted_remote") {
        updatedTasks[taskIndex] = {
          ...task,
          calendarLink: {
            ...task.calendarLink,
            syncStatus: "deleted_remote",
            syncError: "Google Calendar event is verwijderd of geannuleerd.",
            lastSyncedAt: now,
          },
          updatedAt: now,
        };
        dirty = true;
        result.deletedRemote++;
      }
      continue;
    }

    // Conflict detection: both sides changed since last sync
    const lastSyncedMs = isoMs(task.calendarLink?.lastSyncedAt ?? task.calendarLink?.lastSynced);
    const googleUpdatedMs = isoMs(event.updated);
    const taskUpdatedMs = isoMs(task.updatedAt);

    if (
      lastSyncedMs > 0 &&
      googleUpdatedMs > lastSyncedMs &&
      taskUpdatedMs > lastSyncedMs
    ) {
      if (task.calendarLink?.syncStatus !== "conflict") {
        updatedTasks[taskIndex] = {
          ...task,
          calendarLink: {
            ...task.calendarLink,
            syncStatus: "conflict",
            googleUpdatedAt: event.updated,
            syncError: "Zowel Google Calendar als Mentor zijn gewijzigd na de laatste sync.",
          },
          updatedAt: now,
        };
        dirty = true;
        result.conflicts++;
        // Save conflict snapshot for resolution via /api/google/calendar/conflicts
        await saveConflictSnapshot(
          task.id,
          event.eventId,
          event.calendarId,
          {
            plannedStart: task.plannedStart,
            plannedEnd: task.plannedEnd,
            plannedDate: task.plannedDate,
            plannedMinutes: task.plannedMinutes,
            updatedAt: task.updatedAt,
          },
          {
            start: event.start,
            end: event.end,
            summary: event.summary,
            updated: event.updated,
            htmlLink: event.htmlLink,
          }
        ).catch(() => {}); // Non-fatal
      }
      continue;
    }

    // Google changed start/end → update task planning (1 min tolerance for timezone normalization)
    const eventStartMs = isoMs(event.start);
    const taskStartMs = isoMs(task.plannedStart);
    const startDriftMs = Math.abs(eventStartMs - taskStartMs);

    if (event.start && event.end && eventStartMs > 0 && startDriftMs > 60_000) {
      updatedTasks[taskIndex] = {
        ...task,
        plannedStart: event.start,
        plannedEnd: event.end,
        plannedDate: event.start.slice(0, 10),
        plannedMinutes: minutesBetween(event.start, event.end),
        calendarLink: {
          ...task.calendarLink,
          syncStatus: "synced",
          googleUpdatedAt: event.updated,
          lastSyncedAt: now,
          syncError: null,
        },
        updatedAt: now,
      };
      dirty = true;
      result.updated++;
    }
  }

  if (dirty) await writeTasks(updatedTasks);
  return result;
}
