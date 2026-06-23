import { NextRequest, NextResponse } from "next/server";
import { readFreight, writeFreight, withWorkLock, deleteWerkImage } from "@/lib/werk/workStore";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return await withWorkLock(async () => {
      const all = await readFreight();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
      await deleteWerkImage(all[idx].imageFile);
      all.splice(idx, 1);
      await writeFreight(all);
      return NextResponse.json({ ok: true });
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
