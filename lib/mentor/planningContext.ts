import { readScheduleBlocks, readSchedulingWindows } from "@/lib/scheduler/scheduleStorage";
import { readEventCache } from "@/lib/calendar/googleSyncStorage";

// Compacte planning-context voor de mentor-chat: wat staat er al + waar is vrije tijd.
// Bewust kort gehouden (server-side berekend) om token-gebruik laag te houden.

const NL_DAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MIN_FREE_MIN = 30;   // negeer gaten < 30 min
const HORIZON_DAYS = 9;    // vandaag + 8 dagen
const MAX_FREE_PER_DAY = 4;

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
function dowLabel(isoDate: string): string {
  return NL_DAYS[new Date(`${isoDate}T12:00:00Z`).getUTCDay()];
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
  // "YYYY-MM-DDTHH:MM..." → minuten sinds middernacht (lokaal)
  const t = dt.slice(11, 16);
  return t ? toMin(t) : 0;
}

interface Busy { startMin: number; endMin: number; }

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

  // Busy per dag: schedule blocks + externe (niet-app) Google events.
  const busyByDay = new Map<string, Busy[]>();
  const addBusy = (day: string, s: number, e: number) => {
    if (e <= s) return;
    if (!busyByDay.has(day)) busyByDay.set(day, []);
    busyByDay.get(day)!.push({ startMin: s, endMin: e });
  };
  for (const b of blocks) {
    const day = b.start.slice(0, 10);
    if (day < today || day > horizonEnd) continue;
    addBusy(day, timeOf(b.start), timeOf(b.end));
  }
  for (const e of cache) {
    if (e.status === "cancelled") continue;
    if (e.extendedProperties?.private?.aiMentorTaskId) continue; // app-event → zit al in blocks
    if (!e.start || e.start.length <= 10) continue; // all-day overslaan
    const day = e.start.slice(0, 10);
    if (day < today || day > horizonEnd) continue;
    addBusy(day, timeOf(e.start), e.end ? timeOf(e.end) : timeOf(e.start) + 30);
  }

  const nowMin = toMin(new Date().toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false }));
  const lines: string[] = [];
  let plannedCount = 0;

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const day = addDays(today, i);
    const wd = isoWeekday(day);
    const dayWindows = activeWindows.filter(w => w.daysOfWeek.includes(wd));
    if (dayWindows.length === 0) continue;

    const busy = (busyByDay.get(day) ?? []).sort((a, b) => a.startMin - b.startMin);
    plannedCount += busy.length;

    // Vrije gaten = vensters minus busy (per venster)
    const free: string[] = [];
    for (const w of dayWindows) {
      let cursor = Math.max(toMin(w.startTime), i === 0 ? nowMin : 0);
      const wEnd = toMin(w.endTime);
      const inWin = busy.filter(b => b.endMin > cursor && b.startMin < wEnd).sort((a, b) => a.startMin - b.startMin);
      for (const b of inWin) {
        if (b.startMin - cursor >= MIN_FREE_MIN) free.push(`${fromMin(cursor)}-${fromMin(b.startMin)}`);
        cursor = Math.max(cursor, b.endMin);
      }
      if (wEnd - cursor >= MIN_FREE_MIN) free.push(`${fromMin(cursor)}-${fromMin(wEnd)}`);
    }
    const label = `${dowLabel(day)} ${day.slice(8)}-${day.slice(5, 7)}`;
    const freeStr = free.length ? free.slice(0, MAX_FREE_PER_DAY).join(", ") : "vol";
    lines.push(`  ${label}: ${freeStr}`);
  }

  if (lines.length === 0) return "";
  return `Vrije tijd binnen je werk-/avondvensters (al gepland: ${plannedCount} blokken komende dagen):\n${lines.join("\n")}`;
}
