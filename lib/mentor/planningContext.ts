import { readScheduleBlocks, readSchedulingWindows } from "@/lib/scheduler/scheduleStorage";
import { readEventCache } from "@/lib/calendar/googleSyncStorage";

// Planning-context voor de mentor-chat: per dag wat er GEPLAND staat én wat VRIJ is.
// Server-side berekend (geen AI) zodat de mentor beschikbaarheidsvragen exact kan beantwoorden.

const NL_FULL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MIN_FREE_MIN = 30;       // negeer gaten < 30 min
const HORIZON_DAYS = 9;        // vandaag + 8 dagen
const MAX_ITEMS_PER_DAY = 6;
const MAX_FREE_PER_DAY = 6;

function todayInAMS(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function isoWeekday(isoDate: string): number {
  const dow = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}
function dowFull(isoDate: string): string {
  return NL_FULL[new Date(`${isoDate}T12:00:00Z`).getUTCDay()];
}
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
function fromMin(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function timeOf(dt: string): number {
  const t = dt.slice(11, 16);
  return t ? toMin(t) : 0;
}

interface Item { startMin: number; endMin: number; label: string }

export async function buildPlanningContext(): Promise<string> {
  const [blocks, windows, cache] = await Promise.all([
    readScheduleBlocks().catch(() => []),
    readSchedulingWindows().catch(() => []),
    readEventCache().catch(() => []),
  ]);
  const activeWindows = windows.filter(w => w.isActive);
  if (activeWindows.length === 0) return "";

  const today = todayInAMS();
  const horizonEnd = addDays(today, HORIZON_DAYS - 1);

  // Geplande items per dag (met label): schedule blocks + externe (niet-app) Google events.
  const byDay = new Map<string, Item[]>();
  const add = (day: string, s: number, e: number, label: string) => {
    if (e <= s) return;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push({ startMin: s, endMin: e, label });
  };
  for (const b of blocks) {
    const day = b.start.slice(0, 10);
    if (day < today || day > horizonEnd) continue;
    add(day, timeOf(b.start), timeOf(b.end), b.title || "taak");
  }
  for (const e of cache) {
    if (e.status === "cancelled") continue;
    if (e.extendedProperties?.private?.aiMentorTaskId) continue; // app-event → zit al in blocks
    if (!e.start || e.start.length <= 10) continue;              // all-day overslaan
    const day = e.start.slice(0, 10);
    if (day < today || day > horizonEnd) continue;
    add(day, timeOf(e.start), e.end ? timeOf(e.end) : timeOf(e.start) + 30, e.summary || "afspraak");
  }

  const nowMin = toMin(new Date().toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false }));
  const lines: string[] = [];

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const day = addDays(today, i);
    const wd = isoWeekday(day);
    const dayWindows = activeWindows.filter(w => w.daysOfWeek.includes(wd));
    if (dayWindows.length === 0) continue;

    const items = (byDay.get(day) ?? []).sort((a, b) => a.startMin - b.startMin);

    // Vrije gaten = actieve vensters minus geplande items (vandaag vanaf "nu").
    const free: string[] = [];
    for (const w of [...dayWindows].sort((a, b) => toMin(a.startTime) - toMin(b.startTime))) {
      let cursor = Math.max(toMin(w.startTime), i === 0 ? nowMin : 0);
      const wEnd = toMin(w.endTime);
      const inWin = items.filter(b => b.endMin > cursor && b.startMin < wEnd);
      for (const b of inWin) {
        if (b.startMin - cursor >= MIN_FREE_MIN) free.push(`${fromMin(cursor)}-${fromMin(b.startMin)}`);
        cursor = Math.max(cursor, b.endMin);
      }
      if (wEnd - cursor >= MIN_FREE_MIN) free.push(`${fromMin(cursor)}-${fromMin(wEnd)}`);
    }

    const label = `${dowFull(day)} ${day.slice(8)}-${day.slice(5, 7)}`;
    const plannedStr = items.length
      ? items.slice(0, MAX_ITEMS_PER_DAY).map(b => `${fromMin(b.startMin)} ${b.label.slice(0, 28)}`).join("; ")
      : "niets";
    const freeStr = free.length ? free.slice(0, MAX_FREE_PER_DAY).join(", ") : "vol";
    lines.push(`  ${label} — gepland: ${plannedStr} | vrij: ${freeStr}`);
  }

  if (lines.length === 0) return "";
  return `Je planning (komende dagen, binnen je werk-/avondvensters). "gepland" = al bezet, "vrij" = beschikbaar:\n${lines.join("\n")}`;
}
