import { NextRequest, NextResponse } from "next/server";
import {
  readReceipts, writeReceipts, saveReceiptImage, withReceiptsLock, isPlausibleReceiptDate,
} from "@/lib/finance/receipts";
import { fetchInvoicePdf, parseInvoicePdf } from "@/lib/finance/gmailInvoice";

export const runtime = "nodejs";

// Haalt de factuur-PDF uit Gmail (via het Gmail-leesrecht van de app), bewaart 'm bij
// de bon (zodat je 'm in-app kunt openen) en vult bedrag/datum/winkel/status in.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const receipts = await readReceipts();
    const r = receipts.find(x => x.id === id);
    if (!r) return NextResponse.json({ error: "Bon niet gevonden" }, { status: 404 });
    if (!r.gmailMessageId) return NextResponse.json({ error: "Geen gekoppelde Gmail-mail (gmailMessageId ontbreekt)" }, { status: 400 });

    const pdf = await fetchInvoicePdf(r.gmailMessageId, r.gmailAttachmentId);
    if (!pdf) return NextResponse.json({ error: "Geen PDF-bijlage gevonden in de mail" }, { status: 404 });

    const file = await saveReceiptImage(id, pdf.buffer, "application/pdf");
    const fields = await parseInvoicePdf(pdf.buffer);

    const updated = await withReceiptsLock(async () => {
      const all = await readReceipts();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return null;
      const cur = all[idx];
      all[idx] = {
        ...cur,
        imageFile: file,
        imageMime: "application/pdf",
        amountCents: fields?.amountCents != null ? fields.amountCents : cur.amountCents,
        merchant: fields?.merchant || cur.merchant,
        date: (fields?.date && isPlausibleReceiptDate(fields.date)) ? fields.date : cur.date,
        docType: fields ? fields.docType : cur.docType,
        paymentStatus: (fields && fields.paymentStatus !== "onbekend") ? fields.paymentStatus : cur.paymentStatus,
        aiAnalyzed: true,
        aiRaw: fields?.summary ?? cur.aiRaw,
        reviewed: false,
        updatedAt: new Date().toISOString(),
      };
      await writeReceipts(all);
      return all[idx];
    });

    if (!updated) return NextResponse.json({ error: "Bon verdween tijdens ophalen" }, { status: 409 });
    return NextResponse.json({
      ok: true,
      amountEur: updated.amountCents != null ? (updated.amountCents / 100).toFixed(2) : null,
      receipt: updated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fout";
    const status = /gekoppeld|gmail/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
