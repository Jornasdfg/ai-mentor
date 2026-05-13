import { NextResponse } from "next/server";
import { readConflicts } from "@/lib/calendar/googleConflictStorage";

export async function GET() {
  try {
    const conflicts = await readConflicts();
    const open = conflicts.filter(c => c.status === "open");
    const resolved = conflicts.filter(c => c.status === "resolved").slice(0, 20);
    return NextResponse.json({ open, resolved, total: conflicts.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Conflicten ophalen mislukt" },
      { status: 500 }
    );
  }
}
