import { NextResponse } from "next/server";
import { getCostSummary, resetCost } from "@/lib/storage/costStorage";

export async function GET() {
  try {
    const summary = await getCostSummary();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: reset teller
export async function DELETE() {
  try {
    await resetCost();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
