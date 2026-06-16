import { NextRequest, NextResponse } from "next/server";
import {
  readReceipts, writeReceipts, deleteReceiptImage,
  parseAmountToCents, normalizeKind, type Receipt,
} from "@/lib/finance/receipts";

export const runtime = "nodejs";

// PATCH — een bon bijwerken (handmatige correctie van bedrag/omschrijving/etc.).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as Partial<{
      description: string; merchant: string | null; kind: string;
      amount: string; amountCents: number | null; date: string;
      category: string | null; note: string | null;
    }>;

    const receipts = await readReceipts();
    const idx = receipts.findIndex(r => r.id === id);
    if (idx === -1) return NextResponse.json({ error: "Bon niet gevonden" }, { status: 404 });

    const r = receipts[idx];
    const patch: Partial<Receipt> = { updatedAt: new Date().toISOString() };
    if (body.description !== undefined) patch.description = body.description.trim() || "Bon";
    if (body.merchant !== undefined) patch.merchant = body.merchant?.toString().trim() || null;
    if (body.kind !== undefined) patch.kind = normalizeKind(body.kind);
    if (body.category !== undefined) patch.category = body.category?.toString().trim() || null;
    if (body.note !== undefined) patch.note = body.note?.toString().trim() || null;
    if (body.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) patch.date = body.date;
    if (body.amountCents !== undefined) patch.amountCents = body.amountCents;
    else if (body.amount !== undefined) patch.amountCents = parseAmountToCents(body.amount);

    receipts[idx] = { ...r, ...patch };
    await writeReceipts(receipts);
    return NextResponse.json({ ok: true, receipt: receipts[idx] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}

// DELETE — bon + bijbehorende foto verwijderen.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const receipts = await readReceipts();
    const idx = receipts.findIndex(r => r.id === id);
    if (idx === -1) return NextResponse.json({ error: "Bon niet gevonden" }, { status: 404 });
    await deleteReceiptImage(receipts[idx].imageFile);
    receipts.splice(idx, 1);
    await writeReceipts(receipts);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
