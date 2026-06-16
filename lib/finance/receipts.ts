import fs from "fs/promises";
import path from "path";

// ── Standalone financiën-module ───────────────────────────────────────────────
// Volledig losstaand van taken/planner/scheduler. Eigen JSON-register + eigen
// map met bonfoto's in de data-volume. Niets hiervan raakt task_register.json.

export type ReceiptKind = "zakelijk" | "prive" | "onbekend";

export interface Receipt {
  id: string;                 // "receipt_<ts>_<rand>"
  description: string;        // korte omschrijving (gebruiker of AI)
  merchant: string | null;    // winkel/leverancier (AI of handmatig)
  kind: ReceiptKind;          // zakelijk / privé / onbekend
  amountCents: number | null; // bedrag in centen (null = onbekend)
  currency: string;           // "EUR"
  date: string;               // YYYY-MM-DD — transactiedatum
  category: string | null;    // bv. "Boodschappen", "Reizen", "Software"
  imageFile: string | null;   // bestandsnaam in data/receipts/
  imageMime: string | null;   // bv. "image/jpeg"
  source: "shortcut" | "manual";
  note: string | null;
  aiAnalyzed: boolean;        // is de bon door AI geanalyseerd?
  aiRaw: string | null;       // ruwe AI-samenvatting (debug/inzicht)
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
  description?: string | null;
  merchant?: string | null;
  kind?: string | null;
  amount?: string | null;       // ruwe tekst, wordt geparsed
  amountCents?: number | null;  // al geparsed (UI)
  date?: string | null;
  category?: string | null;
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
  return {
    id,
    description: (input.description ?? "").toString().trim() || "Bon",
    merchant: input.merchant?.toString().trim() || null,
    kind: normalizeKind(input.kind),
    amountCents: cents,
    currency: "EUR",
    date: isoDateOrToday(input.date),
    category: input.category?.toString().trim() || null,
    imageFile: image.file,
    imageMime: image.mime,
    source,
    note: input.note?.toString().trim() || null,
    aiAnalyzed: false,
    aiRaw: null,
    createdAt: now,
    updatedAt: now,
  };
}
