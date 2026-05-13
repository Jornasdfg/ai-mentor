import type { ParsedMentorOutput } from "../mentorTypes";

export function parseModelOutput(rawOutput: string): ParsedMentorOutput {
  const fallback: ParsedMentorOutput = {
    adviceText: rawOutput.trim(),
    topPriority: undefined,
    todayTasks: [],
    doNotDo: [],
    parked: [],
    upcomingWarnings: [],
    conflicts: [],
    proposedPatches: [],
    updatedReference: null,
    rawOutput,
    parseError: "Output kon niet als JSON worden geparseerd.",
  };

  let cleaned = rawOutput.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\n?([\s\S]*?)\n?```$/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (!parsed.adviceText) return fallback;
    return {
      adviceText: String(parsed.adviceText),
      topPriority: parsed.topPriority as ParsedMentorOutput["topPriority"],
      todayTasks: (parsed.todayTasks as ParsedMentorOutput["todayTasks"]) ?? [],
      doNotDo: (parsed.doNotDo as ParsedMentorOutput["doNotDo"]) ?? [],
      parked: (parsed.parked as ParsedMentorOutput["parked"]) ?? [],
      upcomingWarnings: (parsed.upcomingWarnings as ParsedMentorOutput["upcomingWarnings"]) ?? [],
      conflicts: (parsed.conflicts as ParsedMentorOutput["conflicts"]) ?? [],
      proposedPatches: (parsed.proposedPatches as ParsedMentorOutput["proposedPatches"]) ?? [],
      updatedReference: null,
      rawOutput,
    };
  } catch {
    return fallback;
  }
}
