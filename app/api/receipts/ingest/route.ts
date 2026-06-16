import { NextRequest, NextResponse } from "next/server";
import { createReceiptFromForm } from "@/lib/finance/createFromForm";

export const runtime = "nodejs";

// Token-beveiligde ingest voor de iPhone-Shortcut (Wallet-automatisering).
// Stuur multipart/form-data met header  x-receipts-token: <RECEIPTS_TOKEN>
// Velden: photo (bestand), description, kind (zakelijk|prive), amount, date, note.
export async function POST(req: NextRequest) {
  try {
    const expected = process.env.RECEIPTS_TOKEN;
    const provided = req.headers.get("x-receipts-token");
    if (!expected || provided !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Stuur als multipart/form-data" }, { status: 400 });
    }
    const form = await req.formData();
    const receipt = await createReceiptFromForm(form, "shortcut");
    return NextResponse.json({
      ok: true,
      id: receipt.id,
      merchant: receipt.merchant,
      amountEur: receipt.amountCents != null ? (receipt.amountCents / 100).toFixed(2) : null,
      kind: receipt.kind,
      date: receipt.date,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
