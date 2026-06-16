import { NextRequest, NextResponse } from "next/server";
import { readReceipts } from "@/lib/finance/receipts";
import { createReceiptFromForm } from "@/lib/finance/createFromForm";

export const runtime = "nodejs";

// GET — lijst van alle bonnen (nieuwste eerst). Open, zoals de rest van de app-UI.
export async function GET() {
  const receipts = await readReceipts();
  return NextResponse.json({ receipts });
}

// POST — handmatig een bon toevoegen vanuit de app (multipart, foto optioneel).
export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Stuur als multipart/form-data" }, { status: 400 });
    }
    const form = await req.formData();
    const { receipt, duplicate } = await createReceiptFromForm(form, "manual");
    return NextResponse.json({ ok: true, duplicate, receipt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
