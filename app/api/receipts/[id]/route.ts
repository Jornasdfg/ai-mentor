import { NextRequest, NextResponse } from "next/server";
import {
  readReceipts, writeReceipts, deleteReceiptImage, withReceiptsLock,
  parseAmountToCents, normalizeKind, normalizeDocType, normalizePaymentStatus, type Receipt,
} from "@/lib/finance/receipts";

export const runtime = "nodejs";

// PATCH — een bon bijwerken (handmatige correctie van bedrag/omschrijving/etc.).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as Partial<{
      docType: string; description: string; merchant: string | null; kind: string;
      amount: string; amountCents: number | null; date: string;
      category: string | null; paymentStatus: string; note: string | null; reviewed: boolean;
      sourceUrl: string | null;
    }>;

    return await withReceiptsLock(async () => {
    const receipts = await readReceipts();
    const idx = receipts.findIndex(r => r.id === id);
    if (idx === -1) return NextResponse.json({ error: "Bon niet gevonden" }, { status: 404 });

    const r = receipts[idx];
    const patch: Partial<Receipt> = { updatedAt: new Date().toISOString() };
    if (body.docType !== undefined) patch.docType = normalizeDocType(body.docType);
    if (body.description !== undefined) patch.description = body.description.trim() || "Bon";
    if (body.merchant !== undefined) patch.merchant = body.merchant?.toString().trim() || null;
    if (body.kind !== undefined) patch.kind = normalizeKind(body.kind);
    if (body.paymentStatus !== undefined) patch.paymentStatus = normalizePaymentStatus(body.paymentStatus);
    if (body.category !== undefined) patch.category = body.category?.toString().trim() || null;
    if (body.note !== undefined) patch.note = body.note?.toString().trim() || null;
    if (body.sourceUrl !== undefined) patch.sourceUrl = body.sourceUrl?.toString().trim() || null;
    if (body.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) patch.date = body.date;
    if (body.amountCents !== undefined) patch.amountCents = body.amountCents;
    else if (body.amount !== undefined) patch.amountCents = parseAmountToCents(body.amount);
    // Expliciet meegegeven reviewed-waarde, anders markeert elke bewerking de bon als gecontroleerd.
    patch.reviewed = body.reviewed !== undefined ? body.reviewed : true;

    receipts[idx] = { ...r, ...patch };
    await writeReceipts(receipts);
    return NextResponse.json({ ok: true, receipt: receipts[idx] });
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}

// DELETE — bon + bijbehorende foto verwijderen.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return await withReceiptsLock(async () => {
    const receipts = await readReceipts();
    const idx = receipts.findIndex(r => r.id === id);
    if (idx === -1) return NextResponse.json({ error: "Bon niet gevonden" }, { status: 404 });
    await deleteReceiptImage(receipts[idx].imageFile);
    receipts.splice(idx, 1);
    await writeReceipts(receipts);
    return NextResponse.json({ ok: true });
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
