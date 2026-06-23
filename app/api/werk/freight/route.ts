import { NextRequest, NextResponse } from "next/server";
import {
  readFreight, writeFreight, withWorkLock, saveWerkImage, isoDateOrToday, newId,
  type Vrachtbon,
} from "@/lib/werk/workStore";

export const runtime = "nodejs";

const MAX = 20 * 1024 * 1024;

// GET — alle vrachtbonnen (nieuwste eerst).
export async function GET() {
  const freight = (await readFreight()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
  return NextResponse.json({ freight });
}

// POST — vrachtbon toevoegen (multipart: photo + optioneel date/description).
export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Stuur als multipart/form-data" }, { status: 400 });
    }
    const form = await req.formData();
    const photo = form.get("photo") ?? form.get("image") ?? form.get("file");
    if (!(photo instanceof Blob) || photo.size === 0) {
      return NextResponse.json({ error: "Geen foto ontvangen" }, { status: 400 });
    }
    if (photo.size > MAX) return NextResponse.json({ error: "Foto te groot (max 20MB)" }, { status: 400 });

    const id = newId("vb");
    const mime = photo.type || "image/jpeg";
    const file = await saveWerkImage(id, Buffer.from(await photo.arrayBuffer()), mime);
    const dateRaw = form.get("date");
    const descRaw = form.get("description");

    const entry: Vrachtbon = {
      id,
      date: isoDateOrToday(typeof dateRaw === "string" ? dateRaw : null),
      description: typeof descRaw === "string" && descRaw.trim() ? descRaw.trim() : null,
      imageFile: file,
      imageMime: mime,
      createdAt: new Date().toISOString(),
    };

    const saved = await withWorkLock(async () => {
      const all = await readFreight();
      all.unshift(entry);
      await writeFreight(all);
      return entry;
    });
    return NextResponse.json({ ok: true, freight: saved });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
