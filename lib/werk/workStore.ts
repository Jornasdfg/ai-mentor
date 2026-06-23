import fs from "fs/promises";
import path from "path";

// ── Standalone Werk-module (Van Vijven Transport) ─────────────────────────────
// Volledig losstaand van taken/planner/financiën/scheduler. Eigen JSON-bestanden
// en eigen afbeeldingen-map. Niets hiervan raakt de andere app-data.

export interface WorkHours {
  id: string;              // "wh_<ts>_<rand>"
  date: string;            // YYYY-MM-DD
  hours: number;           // aantal uren (bv. 8.5)
  start: string | null;    // optioneel "HH:mm"
  end: string | null;      // optioneel "HH:mm"
  note: string | null;
  airtableRecordId: string | null; // gevuld zodra naar Airtable gepusht
  airtableSyncedAt: string | null;
  airtableStatus: string | null;   // laatst bekende Airtable-status (bv. "Nog te verwerken" / "Verwerkt")
  createdAt: string;
  updatedAt: string;
}

export interface Vrachtbon {
  id: string;              // "vb_<ts>_<rand>"
  date: string;            // YYYY-MM-DD
  description: string | null;
  imageFile: string | null;
  imageMime: string | null;
  createdAt: string;
}

function dataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR ? path.resolve(base, process.env.DATA_DIR) : path.join(base, "data");
}
const HOURS_FILE = () => path.join(dataDir(), "work_hours.json");
const FREIGHT_FILE = () => path.join(dataDir(), "vrachtbonnen.json");
const IMG_DIR = () => path.join(dataDir(), "werk_images");

async function readJson<T>(file: string): Promise<T[]> {
  try { return JSON.parse(await fs.readFile(file, "utf-8")) as T[]; } catch { return []; }
}
async function writeJson<T>(file: string, data: T[]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

// In-process schrijf-lock (zelfde patroon als financiën) tegen race bij gelijktijdige writes.
let lock: Promise<unknown> = Promise.resolve();
export function withWorkLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.then(() => {}, () => {});
  return run;
}

export const readHours = () => readJson<WorkHours>(HOURS_FILE());
export const writeHours = (h: WorkHours[]) => writeJson(HOURS_FILE(), h);
export const readFreight = () => readJson<Vrachtbon>(FREIGHT_FILE());
export const writeFreight = (v: Vrachtbon[]) => writeJson(FREIGHT_FILE(), v);

export async function saveWerkImage(id: string, buffer: Buffer, mime: string): Promise<string> {
  await fs.mkdir(IMG_DIR(), { recursive: true });
  const ext = mime.includes("pdf") ? ".pdf" : mime.includes("png") ? ".png" : mime.includes("heic") ? ".heic" : ".jpg";
  const filename = `${id}${ext}`;
  await fs.writeFile(path.join(IMG_DIR(), filename), buffer);
  return filename;
}

export async function readWerkImage(filename: string): Promise<Buffer | null> {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return null;
  try { return await fs.readFile(path.join(IMG_DIR(), filename)); } catch { return null; }
}

export async function deleteWerkImage(filename: string | null): Promise<void> {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return;
  try { await fs.unlink(path.join(IMG_DIR(), filename)); } catch { /* al weg */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function parseHours(input: string | number | null | undefined): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (!input) return 0;
  const v = parseFloat(String(input).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}

export function isoDateOrToday(input: string | null | undefined): string {
  const s = (input ?? "").toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

// Uren afleiden uit start/eind (HH:mm) als die gegeven zijn.
export function hoursFromRange(start: string | null, end: string | null): number | null {
  if (!start || !end || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // over middernacht
  return Math.round((mins / 60) * 100) / 100;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
