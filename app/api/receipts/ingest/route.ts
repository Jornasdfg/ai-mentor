import { NextRequest, NextResponse } from "next/server";
import { createReceiptFromForm } from "@/lib/finance/createFromForm";

export const runtime = "nodejs";

// Token-beveiligde ingest voor de iPhone-Shortcut én de Gmail-routine (facturen).
// Stuur multipart/form-data met header  x-receipts-token: <RECEIPTS_TOKEN>
// Velden: photo (bestand, optioneel), docType (bon|factuur), description, merchant,
//   kind (zakelijk|prive), amount, date, paymentStatus (betaald|openstaand), note,
//   sourceUrl, source (shortcut|gmail), dedupKey (idempotent — zelfde niet opnieuw).
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
    const srcRaw = (form.get("source") ?? "").toString();
    const source = srcRaw === "gmail" ? "gmail" : "shortcut";
    const { receipt, duplicate } = await createReceiptFromForm(form, source);
    return NextResponse.json({
      ok: true,
      duplicate,                 // true = bestond al (niet opnieuw toegevoegd)
      id: receipt.id,
      docType: receipt.docType,
      merchant: receipt.merchant,
      amountEur: receipt.amountCents != null ? (receipt.amountCents / 100).toFixed(2) : null,
      kind: receipt.kind,
      paymentStatus: receipt.paymentStatus,
      date: receipt.date,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
