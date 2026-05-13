import { NextRequest, NextResponse } from "next/server";
import {
  readMentorState,
  ensureDataFiles,
  writeInbox,
  writeTasks,
  writeDecisions,
  appendContextArchive,
  readDecisions,
} from "@/lib/mentor/mentorStorage";
import { applyProposedPatches } from "@/lib/mentor/patchApplier";
import { regenerateDailyReference } from "@/lib/mentor/dailyReferenceGenerator";
import type { MentorPatch } from "@/lib/mentorTypes";

export async function POST(req: NextRequest) {
  try {
    await ensureDataFiles();
    const body = await req.json() as { patches: MentorPatch[] };
    if (!Array.isArray(body.patches)) {
      return NextResponse.json({ error: "patches array vereist" }, { status: 400 });
    }

    const state = await readMentorState();
    const newState = applyProposedPatches(state, body.patches);

    await Promise.all([
      writeTasks(newState.tasks),
      writeDecisions(newState.decisions),
      writeInbox(newState.inboxItems),
    ]);

    for (const patch of body.patches) {
      if (patch.operation === "add_context_note" && patch.data.note) {
        await appendContextArchive(String(patch.data.note));
      }
    }

    await regenerateDailyReference(newState.tasks, newState.decisions);

    return NextResponse.json({
      ok: true,
      appliedCount: body.patches.length,
      tasks: newState.tasks,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
