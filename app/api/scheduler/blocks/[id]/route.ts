import { NextRequest, NextResponse } from "next/server";
import { readScheduleBlocks, writeScheduleBlocks } from "@/lib/scheduler/scheduleStorage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const blocks = await readScheduleBlocks();
    const idx = blocks.findIndex(b => b.id === id);
    if (idx === -1) return NextResponse.json({ error: "Block niet gevonden" }, { status: 404 });
    blocks.splice(idx, 1);
    await writeScheduleBlocks(blocks);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
