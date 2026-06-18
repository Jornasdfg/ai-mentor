import { NextRequest, NextResponse } from "next/server";
import {
  readReceipts, writeReceipts, readReceiptImage, withReceiptsLock,
} from "@/lib/finance/receipts";
import { analyzeReceiptImage } from "@/lib/finance/analyzeReceipt";

export const runtime = "nodejs";

// Leest de opgeslagen bonfoto opnieuw met het huidige (betere) AI-model en
// corrigeert bedrag/winkel/datum/categorie/type/betaalstatus. Handig om bonnen
// die onder het oude systeem (detail:low) verkeerd zijn gelezen recht te trekken.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const receipts = await readReceipts();
    const r = receipts.find(x => x.id === id);
    if (!r) return NextResponse.json({ error: "Bon niet gevonden" }, { status: 404 });
    if (!r.imageFile) return NextResponse.json({ error: "Geen foto om opnieuw te lezen" }, { status: 400 });

    const buf = await readReceiptImage(r.imageFile);
    if (!buf) return NextResponse.json({ error: "Foto niet leesbaar" }, { status: 400 });

    const before = r.amountCents;
    const analysis = await analyzeReceiptImage(buf, r.imageMime || "image/jpeg");
    if (!analysis) return NextResponse.json({ error: "AI-analyse mislukt" }, { status: 502 });

    const updated = await withReceiptsLock(async () => {
      const all = await readReceipts();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return null;
      const cur = all[idx];
      all[idx] = {
        ...cur,
        // Nieuwe lezing wint (corrigeert oude fout); alleen overschrijven als AI iets vond.
        amountCents: analysis.amountCents != null ? analysis.amountCents : cur.amountCents,
        merchant: analysis.merchant || cur.merchant,
        date: analysis.date || cur.date,
        category: analysis.category || cur.category,
        docType: analysis.docType,
        paymentStatus: analysis.paymentStatus !== "onbekend" ? analysis.paymentStatus : cur.paymentStatus,
        kind: cur.kind === "onbekend" ? (analysis.kind === "onbekend" ? "zakelijk" : analysis.kind) : cur.kind,
        aiAnalyzed: true,
        aiRaw: analysis.summary,
        reviewed: false, // opnieuw gelezen → even controleren
        updatedAt: new Date().toISOString(),
      };
      await writeReceipts(all);
      return all[idx];
    });

    if (!updated) return NextResponse.json({ error: "Bon verdween tijdens rescan" }, { status: 409 });
    return NextResponse.json({
      ok: true,
      beforeCents: before,
      afterCents: updated.amountCents,
      receipt: updated,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
