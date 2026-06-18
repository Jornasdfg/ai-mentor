import fs from "fs/promises";
import path from "path";

// ── Standalone financiën-module ───────────────────────────────────────────────
// Volledig losstaand van taken/planner/scheduler. Eigen JSON-register + eigen
// map met bonfoto's in de data-volume. Niets hiervan raakt task_register.json.

export type ReceiptKind = "zakelijk" | "prive" | "onbekend";
export type DocType = "bon" | "factuur";
export type PaymentStatus = "betaald" | "openstaand" | "onbekend";

export interface Receipt {
  id: string;                 // "receipt_<ts>_<rand>"
  docType: DocType;           // bon (kassabon) of factuur
  description: string;        // korte omschrijving (gebruiker of AI)
  merchant: string | null;    // winkel/leverancier (AI of handmatig)
  kind: ReceiptKind;          // zakelijk / privé / onbekend
  amountCents: number | null; // bedrag in centen (null = onbekend)
  currency: string;           // "EUR"
  date: string;               // YYYY-MM-DD — transactie/factuurdatum
  category: string | null;    // bv. "Boodschappen", "Reizen", "Software"
  paymentStatus: PaymentStatus; // betaald / openstaand / onbekend (vooral voor facturen)
  imageFile: string | null;   // bestandsnaam in data/receipts/
  imageMime: string | null;   // bv. "image/jpeg"
  source: "shortcut" | "manual" | "gmail";
  sourceUrl: string | null;   // bv. link naar de Gmail-mail
  dedupKey: string | null;    // stabiele sleutel voor idempotente import (bv. gmail-id / factuurnr)
  note: string | null;
  aiAnalyzed: boolean;        // is de bon door AI geanalyseerd?
  aiRaw: string | null;       // ruwe AI-samenvatting (debug/inzicht)
  reviewed: boolean;          // door de gebruiker bevestigd (false = nog controleren)
  createdAt: string;          // ISO
  updatedAt: string;          // ISO
}

function getDataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR
    ? path.resolve(base, process.env.DATA_DIR)
    : path.join(base, "data");
}
function registerPath(): string {
  return path.join(getDataDir(), "receipts.json");
}
function imagesDir(): string {
  return path.join(getDataDir(), "receipts");
}

export async function readReceipts(): Promise<Receipt[]> {
  try {
    const raw = await fs.readFile(registerPath(), "utf-8");
    return JSON.parse(raw) as Receipt[];
  } catch {
    return [];
  }
}

export async function writeReceipts(receipts: Receipt[]): Promise<void> {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(registerPath(), JSON.stringify(receipts, null, 2), "utf-8");
}

// ── Ingest-logboek (diagnose: welke pushes kwamen binnen?) ───────────────────
export interface IngestLogEntry {
  ts: string;
  source: string;
  hasPhoto: boolean;
  mime: string | null;
  sizeKB: number | null;
  dedupKey: string | null;
  result: "created" | "duplicate" | "error";
  receiptId: string | null;
  amountCents: number | null;
  error: string | null;
}
function ingestLogPath(): string { return path.join(getDataDir(), "receipts_ingest_log.json"); }
export async function readIngestLog(): Promise<IngestLogEntry[]> {
  try { return JSON.parse(await fs.readFile(ingestLogPath(), "utf-8")) as IngestLogEntry[]; }
  catch { return []; }
}
export async function logIngest(entry: IngestLogEntry): Promise<void> {
  try {
    await withReceiptsLock(async () => {
      const log = await readIngestLog();
      log.unshift(entry);
      if (log.length > 200) log.length = 200;
      await fs.mkdir(getDataDir(), { recursive: true });
      await fs.writeFile(ingestLogPath(), JSON.stringify(log, null, 2), "utf-8");
    });
  } catch { /* logboek is best-effort */ }
}

// ── Schrijf-lock ──────────────────────────────────────────────────────────────
// receipts.json wordt via read-modify-write bijgewerkt. Bij gelijktijdige uploads
// (meerdere bonnen kort na elkaar uit de iPhone-automatisering) zou een tweede write
// een eerste kunnen overschrijven → verloren bon. Deze in-process mutex serialiseert
// alle wijzigingen, zodat elke bon bewaard blijft.
let receiptsLock: Promise<unknown> = Promise.resolve();
export function withReceiptsLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = receiptsLock.then(fn, fn);
  receiptsLock = run.then(() => {}, () => {});
  return run;
}

export async function saveReceiptImage(id: string, buffer: Buffer, mime: string): Promise<string> {
  await fs.mkdir(imagesDir(), { recursive: true });
  const ext = mimeToExt(mime);
  const filename = `${id}${ext}`;
  await fs.writeFile(path.join(imagesDir(), filename), buffer);
  return filename;
}

export async function readReceiptImage(filename: string): Promise<Buffer | null> {
  // Bescherm tegen path-traversal: alleen een kale bestandsnaam toegestaan.
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return null;
  try {
    return await fs.readFile(path.join(imagesDir(), filename));
  } catch {
    return null;
  }
}

export async function deleteReceiptImage(filename: string | null): Promise<void> {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return;
  try {
    await fs.unlink(path.join(imagesDir(), filename));
  } catch { /* al weg */ }
}

function mimeToExt(mime: string): string {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("heic") || mime.includes("heif")) return ".heic";
  return ".jpg";
}

// ── Bedrag-parsing (NL + internationaal) ──────────────────────────────────────
// Accepteert "12,50", "12.50", "€ 12,50", "1.234,56", "1,234.56", "12".
export function parseAmountToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim().replace(/[€$\s]/g, "");
  if (!s) return null;
  s = s.replace(/[^0-9.,-]/g, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // De laatste van de twee is de decimaalscheider.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // NL: punt = duizend, komma = decimaal
    } else {
      s = s.replace(/,/g, ""); // EN: komma = duizend
    }
  } else if (hasComma) {
    s = s.replace(",", "."); // komma = decimaal
  }
  const value = parseFloat(s);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function normalizeKind(input: string | null | undefined): ReceiptKind {
  const s = (input ?? "").toString().trim().toLowerCase();
  if (["zakelijk", "business", "werk", "z", "b"].includes(s)) return "zakelijk";
  if (["prive", "privé", "private", "p"].includes(s)) return "prive";
  return "onbekend";
}

export function normalizeDocType(input: string | null | undefined): DocType {
  return /factuur|invoice|nota|rekening/i.test((input ?? "").toString()) ? "factuur" : "bon";
}

export function normalizePaymentStatus(input: string | null | undefined): PaymentStatus {
  const s = (input ?? "").toString().trim().toLowerCase();
  if (/betaald|paid|voldaan|verwerkt|afgeschreven/.test(s)) return "betaald";
  if (/open|onbetaald|unpaid|te\s*betalen|verschuldigd|nog\s*voldoen/.test(s)) return "openstaand";
  return "onbekend";
}

// Vindt een bestaande bon/factuur met dezelfde dedupKey (voor idempotente import).
export function findByDedupKey(receipts: Receipt[], key: string | null | undefined): Receipt | undefined {
  if (!key) return undefined;
  return receipts.find(r => r.dedupKey && r.dedupKey === key);
}

// Een door AI gelezen bondatum is alleen geloofwaardig als hij niet in de toekomst
// ligt en niet absurd oud is (>~13 mnd). Anders is het meestal een misread → we
// vallen terug op vandaag (toevoegdatum), zodat de bon niet in een vreemde maand
// "verdwijnt".
export function isPlausibleReceiptDate(dateStr: string | null | undefined): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return false;
  const now = Date.now();
  const dayMs = 86_400_000;
  if (d.getTime() > now + 2 * dayMs) return false;        // toekomst
  if (d.getTime() < now - 400 * dayMs) return false;       // ouder dan ~13 mnd
  return true;
}

function isoDateOrToday(input: string | null | undefined): string {
  const s = (input ?? "").toString().trim();
  // Accepteer YYYY-MM-DD; anders vandaag (Amsterdam).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

export function newReceiptId(): string {
  return `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export interface ReceiptInput {
  docType?: string | null;
  description?: string | null;
  merchant?: string | null;
  kind?: string | null;
  amount?: string | null;       // ruwe tekst, wordt geparsed
  amountCents?: number | null;  // al geparsed (UI)
  date?: string | null;
  category?: string | null;
  paymentStatus?: string | null;
  sourceUrl?: string | null;
  dedupKey?: string | null;
  note?: string | null;
}

export function buildReceipt(
  id: string,
  input: ReceiptInput,
  source: Receipt["source"],
  image: { file: string | null; mime: string | null }
): Receipt {
  const now = new Date().toISOString();
  const cents = input.amountCents != null ? input.amountCents : parseAmountToCents(input.amount);
  const docType = normalizeDocType(input.docType);
  return {
    id,
    docType,
    description: (input.description ?? "").toString().trim() || (docType === "factuur" ? "Factuur" : "Bon"),
    merchant: input.merchant?.toString().trim() || null,
    kind: normalizeKind(input.kind),
    amountCents: cents,
    currency: "EUR",
    date: isoDateOrToday(input.date),
    category: input.category?.toString().trim() || null,
    paymentStatus: normalizePaymentStatus(input.paymentStatus),
    imageFile: image.file,
    imageMime: image.mime,
    source,
    sourceUrl: input.sourceUrl?.toString().trim() || null,
    dedupKey: input.dedupKey?.toString().trim() || null,
    note: input.note?.toString().trim() || null,
    aiAnalyzed: false,
    aiRaw: null,
    // Handmatig toegevoegd = meteen bevestigd; gepusht (shortcut/gmail) = nog controleren in de app.
    reviewed: source === "manual",
    createdAt: now,
    updatedAt: now,
  };
}
