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
  const blocks = await readBlocks();
  return dates.map(date => {
    const dayBlocks = blocks.filter(b => (b.start ?? "").slice(0, 10) === date);
    const weekday = isoWeekday(date);
    const isWorkDay = weekday >= 2 && weekday <= 4; // di/wo/do
    const hasFixed = dayBlocks.some(b => isFixed(b) && isDaytime(b)); // vaste afspraak OVERDAG

    let status: DayStatus;
    let note: string;
    if (hasFixed) {
      // Alleen een VASTE afspraak maakt een dag niet mogelijk.
      status = "vast"; note = "Niet mogelijk — staat al een afspraak";
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
