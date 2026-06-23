import fs from "fs/promises";
import path from "path";

// Leidt beschikbaarheid af uit de PLANNING (data/schedule_blocks.json) — ALLEEN-LEZEN,
// raakt niets aan. Regels (Van Vijven):
//  - Werkdagen = dinsdag/woensdag/donderdag → standaard "Navragen".
//  - Maandag/vrijdag → standaard "Vrij" (in principe vrij om in te vullen).
//  - NIET MOGELIJK (vol gekleurd) ALLEEN als er een VASTE afspraak OVERDAG (06:00–18:00) staat.
//    Een los flexibel auto-blokje of een AVOND-afspraak blokkeert NIET (werk is overdag).

export type DayStatus = "vast" | "navragen" | "vrij";

interface Block { start?: string; source?: string; locked?: boolean; title?: string }

function dataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR ? path.resolve(base, process.env.DATA_DIR) : path.join(base, "data");
}

async function readBlocks(): Promise<Block[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir(), "schedule_blocks.json"), "utf-8")) as Block[];
  } catch { return []; }
}

// ── Google Calendar-events (echte afspraken/vakanties) ────────────────────────
interface GEvent { summary?: string; start?: string; end?: string; status?: string }
async function readGoogleEvents(): Promise<GEvent[]> {
  try {
    const c = JSON.parse(await fs.readFile(path.join(dataDir(), "google_calendar_event_cache.json"), "utf-8"));
    return Array.isArray(c?.events) ? c.events as GEvent[] : [];
  } catch { return []; }
}
// Info-events die NIET blokkeren (verjaardagen e.d.).
const INFO_RE = /verjaardag|gefeliciteerd|jarig|birthday|🎂|naamdag|feestdag/i;
function isAllDayEvent(e: GEvent): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(e.start ?? ""); }

// Blokkeert een Google-event deze datum? Hele-dag/meerdaags (vakantie, bruiloft) → ja
// (behalve verjaardag-achtige info-events). Getimed → alleen overdag (06–18).
function googleBlocksDate(events: GEvent[], date: string): GEvent | null {
  for (const e of events) {
    if (e.status === "cancelled") continue;
    if (isAllDayEvent(e)) {
      const s = e.start ?? "", en = e.end ?? "";          // end is EXCLUSIEF bij hele-dag
      if (s && en && s <= date && date < en && !INFO_RE.test(e.summary ?? "")) return e;
    } else {
      if ((e.start ?? "").slice(0, 10) !== date) continue;
      const h = parseInt((e.start ?? "").slice(11, 13), 10);
      if (Number.isFinite(h) && h >= DAY_START && h < DAY_END) return e;
    }
  }
  return null;
}

export interface DayAvailability {
  date: string;          // YYYY-MM-DD
  weekday: number;       // 1=ma ... 7=zo
  isWorkDay: boolean;    // di/wo/do
  status: DayStatus;
  note: string;
}

function isFixed(b: Block): boolean {
  // Vast = niet door de auto-scheduler los geplaatst (afspraak/handmatig) of vastgezet.
  return b.locked === true || (b.source !== undefined && b.source !== "auto_scheduler");
}

// Overdag = start tussen 06:00 en 18:00. Avondafspraken tellen NIET mee voor
// beschikbaarheid (Van Vijven-werk is overdag rijden).
const DAY_START = 6, DAY_END = 18;
function isDaytime(b: Block): boolean {
  const t = (b.start ?? "").slice(11, 16); // "HH:mm"
  if (!/^\d{2}:\d{2}$/.test(t)) return true; // onbekende tijd → tel mee (veilig)
  const h = parseInt(t.slice(0, 2), 10);
  return h >= DAY_START && h < DAY_END;
}

export async function computeAvailability(dates: string[]): Promise<DayAvailability[]> {
  const [blocks, gevents] = await Promise.all([readBlocks(), readGoogleEvents()]);
  return dates.map(date => {
    const dayBlocks = blocks.filter(b => (b.start ?? "").slice(0, 10) === date);
    const weekday = isoWeekday(date);
    const isWorkDay = weekday >= 2 && weekday <= 4; // di/wo/do
    const gBusy = googleBlocksDate(gevents, date);                   // Google-agenda (vakantie/afspraak)
    const hasFixed = dayBlocks.some(b => isFixed(b) && isDaytime(b)) || !!gBusy; // vaste afspraak OVERDAG of Google-event

    let status: DayStatus;
    let note: string;
    if (hasFixed) {
      // Een vaste afspraak (planning of Google-agenda) maakt de dag niet mogelijk.
      status = "vast"; note = "Niet mogelijk — staat al iets in de agenda";
    } else if (weekday >= 2 && weekday <= 4) {
      status = "navragen"; note = "Werkdag — even navragen";
    } else if (weekday === 1 || weekday === 5) {
      status = "vrij"; note = "In principe vrij — even navragen";
    } else {
      status = "vrij"; note = "Weekend";
    }
    return { date, weekday, isWorkDay, status, note };
  });
}

function isoWeekday(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=zo..6=za
  return wd === 0 ? 7 : wd; // 1=ma..7=zo
}

// Werkweek-datums (ma t/m vr) voor N weken vanaf de maandag van 'fromISO'.
export function workWeekDates(fromISO: string, weeks = 2): string[] {
  const [y, m, d] = fromISO.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const wd = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
  const monday = new Date(base); monday.setUTCDate(base.getUTCDate() - (wd - 1));
  const out: string[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 5; i++) { // ma..vr
      const dt = new Date(monday); dt.setUTCDate(monday.getUTCDate() + w * 7 + i);
      out.push(dt.toISOString().slice(0, 10));
    }
  }
  return out;
}
