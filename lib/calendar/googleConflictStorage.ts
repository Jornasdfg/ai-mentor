import * as fs from "fs/promises";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFLICTS_FILE = path.join(DATA_DIR, "calendar_conflicts.json");

export interface CalendarConflict {
  id: string;
  taskId: string;
  eventId: string;
  calendarId: string;
  status: "open" | "resolved";
  detectedAt: string;
  resolvedAt: string | null;
  resolution: "google_wins_time" | "mentor_wins_time" | "keep_both" | null;
  resolutionNote: string | null;
  taskSnapshot: {
    plannedStart?: string | null;
    plannedEnd?: string | null;
    plannedDate?: string | null;
    plannedMinutes?: number | null;
    updatedAt?: string;
  };
  googleEventSnapshot: {
    start?: string;
    end?: string;
    summary?: string;
    updated?: string;
    htmlLink?: string | null;
  };
}

export async function readConflicts(): Promise<CalendarConflict[]> {
  try {
    const raw = await fs.readFile(CONFLICTS_FILE, "utf-8");
    return (JSON.parse(raw) as { conflicts: CalendarConflict[] }).conflicts ?? [];
  } catch {
    return [];
  }
}

export async function writeConflicts(conflicts: CalendarConflict[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFLICTS_FILE, JSON.stringify({ conflicts }, null, 2), "utf-8");
}

export async function upsertConflict(conflict: CalendarConflict): Promise<void> {
  const conflicts = await readConflicts();
  const idx = conflicts.findIndex(c => c.id === conflict.id);
  if (idx === -1) conflicts.push(conflict);
  else conflicts[idx] = conflict;
  await writeConflicts(conflicts);
}

export async function saveConflictSnapshot(
  taskId: string,
  eventId: string,
  calendarId: string,
  taskSnapshot: CalendarConflict["taskSnapshot"],
  googleEventSnapshot: CalendarConflict["googleEventSnapshot"]
): Promise<CalendarConflict> {
  const conflicts = await readConflicts();

  // Don't create duplicate open conflict for same taskId+eventId
  const existing = conflicts.find(
    c => c.taskId === taskId && c.eventId === eventId && c.status === "open"
  );
  if (existing) return existing;

  const conflict: CalendarConflict = {
    id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    eventId,
    calendarId,
    status: "open",
    detectedAt: new Date().toISOString(),
    resolvedAt: null,
    resolution: null,
    resolutionNote: null,
    taskSnapshot,
    googleEventSnapshot,
  };
  conflicts.push(conflict);
  await writeConflicts(conflicts);
  return conflict;
}

export async function resolveConflict(
  conflictId: string,
  resolution: CalendarConflict["resolution"],
  note?: string
): Promise<CalendarConflict | null> {
  const conflicts = await readConflicts();
  const idx = conflicts.findIndex(c => c.id === conflictId);
  if (idx === -1) return null;

  conflicts[idx] = {
    ...conflicts[idx],
    status: "resolved",
    resolvedAt: new Date().toISOString(),
    resolution,
    resolutionNote: note ?? null,
  };
  await writeConflicts(conflicts);
  return conflicts[idx];
}
