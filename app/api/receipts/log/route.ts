import { NextResponse } from "next/server";
import { readIngestLog } from "@/lib/finance/receipts";

export const runtime = "nodejs";

// Diagnose: de laatste binnengekomen bon-pushes (welke kwamen aan, resultaat, bedrag).
// Handig om te zien of een "ontbrekende" foto wél/niet bij de server is aangekomen.
export async function GET() {
  const log = await readIngestLog();
  return NextResponse.json({ count: log.length, log: log.slice(0, 50) });
}
