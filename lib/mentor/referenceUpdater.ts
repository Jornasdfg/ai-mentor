import { writeReference } from "../storage/referenceStorage";
import { saveVersion } from "../storage/versionStorage";
import {
  readTasks,
  writeDecisions,
  readDecisions,
  writeInbox,
  readInbox,
  writeTasks,
  appendContextArchive,
} from "./mentorStorage";
import { applyMentorPatches } from "./patchApplier";
import type { MentorPatch, MentorState, ReferenceVersion } from "../mentorTypes";

/** @deprecated Gebruik acceptPatches. Schrijft nog steeds de volledige reference weg voor backwards compatibility. */
export async function acceptUpdate(newContent: string): Promise<ReferenceVersion> {
  const version = await saveVersion(newContent);
  await writeReference(newContent);
  return version;
}

export function rejectUpdate(): void {
  // intentionally empty -- side-effect free rejection
}

export async function acceptPatches(patches: MentorPatch[]): Promise<MentorState> {
  const [tasks, decisions, inboxItems] = await Promise.all([
    readTasks(),
    readDecisions(),
    readInbox(),
  ]);

  const currentState: MentorState = { tasks, decisions, inboxItems };
  const newState = applyMentorPatches(currentState, patches);

  await Promise.all([
    writeTasks(newState.tasks),
    writeDecisions(newState.decisions),
    writeInbox(newState.inboxItems),
  ]);

  // Verwerk context notes apart
  for (const patch of patches) {
    if (patch.operation === "add_context_note" && patch.data.note) {
      await appendContextArchive(String(patch.data.note));
    }
  }

  return newState;
}

export function rejectPatches(): void {
  // intentionally empty -- side-effect free rejection
}
