import { NextRequest, NextResponse } from "next/server";
import { readReference, writeReference } from "@/lib/storage/referenceStorage";
import { saveVersion } from "@/lib/storage/versionStorage";

// GET: haal huidig referentiebestand op
export async function GET() {
  try {
    const content = await readReference();
    return NextResponse.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: sla referentiebestand op (met versie-backup)
export async function POST(req: NextRequest) {
  try {
    const { content } = (await req.json()) as { content: string };

    if (typeof content !== "string") {
      return NextResponse.json({ error: "content is verplicht" }, { status: 400 });
    }

    const version = await saveVersion(content);
    await writeReference(content);

    return NextResponse.json({ ok: true, versionId: version.id, label: version.label });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
