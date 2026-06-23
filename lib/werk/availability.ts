import fs from "fs/promises";
import path from "path";

// Leidt beschikbaarheid af uit de PLANNING (data/schedule_blocks.json) — ALLEEN-LEZEN,
// raakt niets aan. Regels (Van Vijven):
//  - Werkdagen = dinsdag/woensdag/donderdag.
//  - VAST (vol gekleurd, "niet mogelijk"): er staat een vast item (afspraak/locked/handmatig)
//    op die dag. Op ma/vr geldt: ELK agenda-item = niet mogelijk.
//  - FLEXIBEL (vage kleur): alleen flexibele (auto-geplande) items op die dag.
//  - VRIJ: leeg. Ma/vr leeg = "vrij — even navragen".

export type DayStatus = "vast" | "flexibel" | "vrij";

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

export async function computeAvailability(dates: string[]): Promise<DayAvailability[]> {
  const blocks = await readBlocks();
  return dates.map(date => {
    const dayBlocks = blocks.filter(b => (b.start ?? "").slice(0, 10) === date);
    const weekday = isoWeekday(date);
    const isWorkDay = weekday >= 2 && weekday <= 4; // di/wo/do
    const hasFixed = dayBlocks.some(isFixed);
    const hasAny = dayBlocks.length > 0;

    let status: DayStatus;
    let note: string;
    if (weekday === 1 || weekday === 5) {
      // ma/vr: in principe vrij, maar elk item = niet mogelijk
      if (hasAny) { status = "vast"; note = "Niet mogelijk (staat al iets gepland)"; }
      else { status = "vrij"; note = "Vrij — even navragen"; }
    } else if (weekday >= 6) {
      status = hasFixed ? "vast" : (hasAny ? "flexibel" : "vrij");
      note = "Weekend";
    } else {
      // di/wo/do
      if (hasFixed) { status = "vast"; note = "Niet mogelijk"; }
      else if (hasAny) { status = "flexibel"; note = "Deels gepland (flexibel)"; }
      else { status = "vrij"; note = "Beschikbaar"; }
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
