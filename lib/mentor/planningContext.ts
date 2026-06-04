import { readScheduleBlocks, readSchedulingWindows } from "@/lib/scheduler/scheduleStorage";
import { readEventCache } from "@/lib/calendar/googleSyncStorage";

// Planning-context voor de mentor-chat: per dag wat er GEPLAND staat én wat VRIJ is.
// Plus resolveAvailability(): beantwoordt "heb ik [dag] [dagdeel] tijd?" DETERMINISTISCH,
// zodat de (goedkope) chat-model dit niet zelf hoeft te interpreteren.

const NL_FULL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MIN_FREE_MIN = 30;
const HORIZON_DAYS = 14;       // genoeg om "volgende [dag]" te dekken
const MAX_ITEMS_PER_DAY = 6;
const MAX_FREE_PER_DAY = 6;

const WEEKDAYS: Record<string, number> = {
  zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5, zaterdag: 6,
};
// Dagdeel → [startMin, endMin]
const DAGDELEN: Record<string, [number, number]> = {
  ochtend: [9 * 60, 12 * 60],
  middag: [13 * 60, 17 * 60],
  avond: [19 * 60, 22 * 60],
};

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
function nowMinAMS(): number {
  return toMin(new Date().toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false }));
}

interface Item { startMin: number; endMin: number; label: string }
interface Range { startMin: number; endMin: number }
interface DayPlan { items: Item[]; free: Range[] }

// Gedeelde berekening: per dag de geplande items + de vrije ranges (binnen actieve vensters).
async function computePlanning(): Promise<Map<string, DayPlan>> {
  const [blocks, windows, cache] = await Promise.all([
    readScheduleBlocks().catch(() => []),
    readSchedulingWindows().catch(() => []),
    readEventCache().catch(() => []),
  ]);
  const map = new Map<string, DayPlan>();
  const activeWindows = windows.filter(w => w.isActive);
  if (activeWindows.length === 0) return map;

  const today = todayInAMS();
  const horizonEnd = addDays(today, HORIZON_DAYS - 1);

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

  const nowMin = nowMinAMS();
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const day = addDays(today, i);
    const wd = isoWeekday(day);
    const dayWindows = activeWindows.filter(w => w.daysOfWeek.includes(wd))
      .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    if (dayWindows.length === 0) continue;

    const items = (byDay.get(day) ?? []).sort((a, b) => a.startMin - b.startMin);
    const free: Range[] = [];
    for (const w of dayWindows) {
      let cursor = Math.max(toMin(w.startTime), i === 0 ? nowMin : 0);
      const wEnd = toMin(w.endTime);
      const inWin = items.filter(b => b.endMin > cursor && b.startMin < wEnd);
      for (const b of inWin) {
        if (b.startMin - cursor >= MIN_FREE_MIN) free.push({ startMin: cursor, endMin: b.startMin });
        cursor = Math.max(cursor, b.endMin);
      }
      if (wEnd - cursor >= MIN_FREE_MIN) free.push({ startMin: cursor, endMin: wEnd });
    }
    map.set(day, { items, free });
  }
  return map;
}

export async function buildPlanningContext(): Promise<string> {
  const plan = await computePlanning();
  if (plan.size === 0) return "";
  const lines: string[] = [];
  for (const [day, { items, free }] of plan) {
    const label = `${dowFull(day)} ${day.slice(8)}-${day.slice(5, 7)}`;
    const plannedStr = items.length
      ? items.slice(0, MAX_ITEMS_PER_DAY).map(b => `${fromMin(b.startMin)} ${b.label.slice(0, 28)}`).join("; ")
      : "niets";
    const freeStr = free.length
      ? free.slice(0, MAX_FREE_PER_DAY).map(f => `${fromMin(f.startMin)}-${fromMin(f.endMin)}`).join(", ")
      : "vol";
    lines.push(`  ${label} — gepland: ${plannedStr} | vrij: ${freeStr}`);
  }
  return `Je planning (komende dagen, binnen je werk-/avondvensters). "gepland" = al bezet, "vrij" = beschikbaar:\n${lines.join("\n")}`;
}

// Beantwoordt een beschikbaarheidsvraag deterministisch. Geeft null als het geen
// (herkenbare) beschikbaarheidsvraag is — dan reageert de mentor gewoon op de context.
export async function resolveAvailability(message: string): Promise<string | null> {
  const t = (message || "").toLowerCase();
  if (!/(tijd|vrij|beschikbaar|kan ik|ruimte|plek|wanneer kan|agenda)/.test(t)) return null;

  const today = todayInAMS();
  let targetISO: string | null = null;

  if (/overmorgen/.test(t)) targetISO = addDays(today, 2);
  else if (/morgen|vanmorgen/.test(t)) targetISO = /vanmorgen/.test(t) ? today : addDays(today, 1);
  else if (/vandaag|vanavond|vanmiddag|vanochtend|vannacht/.test(t)) targetISO = today;
  else {
    for (const [name, dow] of Object.entries(WEEKDAYS)) {
      if (t.includes(name)) {
        for (let i = 0; i < 14; i++) {
          const d = addDays(today, i);
          if (new Date(`${d}T12:00:00Z`).getUTCDay() === dow) { targetISO = d; break; }
        }
        break;
      }
    }
  }
  if (!targetISO) return null;

  // Dagdeel bepalen
  let range: [number, number] | null = null;
  let deel = "";
  if (/avond|vanavond/.test(t)) { range = DAGDELEN.avond; deel = "avond"; }
  else if (/middag|vanmiddag|smiddags/.test(t)) { range = DAGDELEN.middag; deel = "middag"; }
  else if (/ochtend|vanochtend|ochtends|vroege ochtend/.test(t)) { range = DAGDELEN.ochtend; deel = "ochtend"; }

  const plan = await computePlanning();
  const dayPlan = plan.get(targetISO);
  const dateShort = `${targetISO.slice(8)}-${targetISO.slice(5, 7)}`;
  const periodLabel = `${dowFull(targetISO)}${deel ? ` ${deel}` : ""} ${dateShort}`;

  if (!dayPlan) {
    return `BESCHIKBAARHEID (gebruik dit exact): voor ${periodLabel} is er geen werk-/avondvenster actief (bv. weekend of buiten je vensters).`;
  }

  let relevant = dayPlan.free;
  if (range) {
    relevant = dayPlan.free
      .map(f => ({ startMin: Math.max(f.startMin, range![0]), endMin: Math.min(f.endMin, range![1]) }))
      .filter(f => f.endMin - f.startMin >= 15);
  }

  if (relevant.length > 0) {
    const slots = relevant.map(f => `${fromMin(f.startMin)}-${fromMin(f.endMin)}`).join(", ");
    return `BESCHIKBAARHEID (gebruik dit exact, dit is correct): ${periodLabel} is VRIJ — ${slots}. Antwoord bevestigend en noem dit tijdslot.`;
  }
  const planned = dayPlan.items.length
    ? dayPlan.items.slice(0, 4).map(b => `${fromMin(b.startMin)} ${b.label.slice(0, 24)}`).join("; ")
    : "geen vrije ruimte in dat dagdeel";
  return `BESCHIKBAARHEID (gebruik dit exact, dit is correct): ${periodLabel} is BEZET. Gepland: ${planned}.`;
}
