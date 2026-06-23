import { NextRequest, NextResponse } from "next/server";
import {
  readHours, writeHours, withWorkLock, parseHours, hoursFromRange, isoDateOrToday, newId,
  type WorkHours,
} from "@/lib/werk/workStore";
import { pushHoursToAirtable } from "@/lib/werk/airtable";

export const runtime = "nodejs";

// GET — alle uren (nieuwste eerst).
export async function GET() {
  const hours = (await readHours()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
  return NextResponse.json({ hours });
}

// POST — urenregel toevoegen (en, indien geconfigureerd, naar Airtable pushen).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<{ date: string; hours: string | number; start: string; end: string; note: string }>;
    const now = new Date().toISOString();
    const start = body.start && /^\d{2}:\d{2}$/.test(body.start) ? body.start : null;
    const end = body.end && /^\d{2}:\d{2}$/.test(body.end) ? body.end : null;
    let hours = parseHours(body.hours);
    if (!hours) {
      const fromRange = hoursFromRange(start, end);
      if (fromRange) hours = fromRange;
    }
    if (!hours) return NextResponse.json({ error: "Geen geldig aantal uren (vul uren of begin/eind in)" }, { status: 400 });

    const entry: WorkHours = {
      id: newId("wh"),
      date: isoDateOrToday(body.date),
      hours,
      start, end,
      note: body.note?.toString().trim() || null,
      airtableRecordId: null,
      airtableSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    // Naar Airtable pushen (best-effort; faalt stil als niet geconfigureerd).
    try {
      const rec = await pushHoursToAirtable(entry);
      if (rec) { entry.airtableRecordId = rec; entry.airtableSyncedAt = new Date().toISOString(); }
    } catch { /* niet blokkeren */ }

    const saved = await withWorkLock(async () => {
      const all = await readHours();
      all.unshift(entry);
      await writeHours(all);
      return entry;
    });
    return NextResponse.json({ ok: true, hours: saved, airtable: !!saved.airtableRecordId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
