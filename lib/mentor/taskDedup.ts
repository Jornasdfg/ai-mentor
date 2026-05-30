import fs from "fs/promises";
import path from "path";
import type { MentorTask, TaskSourceRef, MentorPriority } from "@/lib/mentorTypes";

// Deterministische dedup-/merge-engine (geen AI, dus gratis qua tokens).
// - Exacte duplicaten (zelfde genormaliseerde titel + project) worden automatisch samengevoegd.
// - Gelijkende/gerelateerde taken worden alleen als SUGGESTIE teruggegeven (mens/AI bevestigt).
// - Vaste afspraken (taskKind "appointment") en al ingeplande taken worden nooit auto-gemerged.

const PRIO_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const ACTIVE = (s: string) => s === "open" || s === "in_progress";
const STOP = new Set(["de","het","een","en","van","voor","met","op","te","in","aan","bij","naar","over","mijn","je","ik","dit","dat","om","of","ook","nog","wel"]);

function norm(s: string): string {
  // NFD + strip van niet-alfanumeriek verwijdert ook accenten (é -> e).
  return (s || "").toLowerCase().normalize("NFD")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter(w => w.length > 2 && !STOP.has(w)));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
function sooner(a?: string | null, b?: string | null): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}
function ensureSources(t: MentorTask): TaskSourceRef[] {
  if (t.sources && t.sources.length) return t.sources;
  return [{ source: t.source ?? "manual_input", at: t.createdAt ?? new Date().toISOString().slice(0, 10) }];
}
function srcKey(s: TaskSourceRef): string {
  return s.ref ? `${s.source}:${s.ref}` : s.source;
}
function distinctSources(srcs: TaskSourceRef[]): number {
  return new Set(srcs.map(srcKey)).size;
}
function higherPrio(a: MentorPriority, b: MentorPriority): MentorPriority {
  return PRIO_ORDER[a] <= PRIO_ORDER[b] ? a : b;
}
function bumpPrio(p: MentorPriority): MentorPriority {
  if (p === "P3") return "P2";
  if (p === "P2") return "P1";
  return p; // nooit auto naar P0
}
function isMergeable(t: MentorTask): boolean {
  return ACTIVE(t.status) && t.taskKind !== "appointment" && !t.plannedStart && !!norm(t.title);
}

export interface DedupSuggestion { ids: string[]; titles: string[]; reason: string; }
export interface DedupResult { tasks: MentorTask[]; mergedCount: number; suggestions: DedupSuggestion[]; }

// Voeg `dup` samen in `canonical` en geef de bijgewerkte canonical terug.
export function mergeTaskInto(canonical: MentorTask, dup: MentorTask, now: string): MentorTask {
  const sources = [...ensureSources(canonical)];
  for (const s of ensureSources(dup)) {
    if (!sources.some(x => srcKey(x) === srcKey(s))) sources.push(s);
  }
  const history = [...(canonical.history ?? [])];
  history.push({ at: now, type: "merge", note: `Samengevoegd: "${dup.title}" (${dup.source}) [${dup.id}]` });

  let merged: MentorTask = {
    ...canonical,
    priority: higherPrio(canonical.priority, dup.priority),
    hardDeadline: sooner(canonical.hardDeadline, dup.hardDeadline),
    deadline: sooner(canonical.deadline, dup.deadline),
    softDeadline: sooner(canonical.softDeadline, dup.softDeadline),
    project: canonical.project ?? dup.project,
    nextAction: canonical.nextAction ?? dup.nextAction,
    reason: canonical.reason ?? dup.reason,
    estimatedMinutes: canonical.estimatedMinutes ?? dup.estimatedMinutes,
    tags: Array.from(new Set([...(canonical.tags ?? []), ...(dup.tags ?? [])])),
    sources,
    mergedFrom: Array.from(new Set([...(canonical.mergedFrom ?? []), dup.id, ...(dup.mergedFrom ?? [])])),
    history,
    updatedAt: now,
  };
  // Meerdere onafhankelijke bronnen bevestigen dezelfde taak → prioriteit omhoog.
  if (distinctSources(sources) >= 2) merged = { ...merged, priority: bumpPrio(merged.priority) };
  return merged;
}

function closeAsMerged(dup: MentorTask, canon: MentorTask, now: string): MentorTask {
  return {
    ...dup,
    status: "cancelled",
    supersededBy: canon.id,
    history: [...(dup.history ?? []), { at: now, type: "merged_away", note: `Samengevoegd in "${canon.title}" [${canon.id}]` }],
    updatedAt: now,
  };
}

// Hoofdfunctie: exacte duplicaten samenvoegen + suggesties voor twijfelgevallen.
export function dedupeTasks(tasks: MentorTask[], now = new Date().toISOString().slice(0, 10)): DedupResult {
  const out = tasks.map(t => ({ ...t }));
  const consumed = new Set<string>();
  let mergedCount = 0;

  // 1. Exacte auto-merge: zelfde genormaliseerde titel + project
  const groups = new Map<string, number[]>();
  out.forEach((t, i) => {
    if (!isMergeable(t)) return;
    const key = `${norm(t.title)}|${norm(t.project ?? "")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    idxs.sort((a, b) => (out[a].createdAt ?? "").localeCompare(out[b].createdAt ?? ""));
    const canonIdx = idxs[0];
    let canon: MentorTask = { ...out[canonIdx], sources: ensureSources(out[canonIdx]) };
    for (const di of idxs.slice(1)) {
      canon = mergeTaskInto(canon, out[di], now);
      out[di] = closeAsMerged(out[di], canon, now);
      consumed.add(out[di].id);
      mergedCount++;
    }
    out[canonIdx] = canon;
  }

  // 2. Suggesties: gelijkende (niet-exacte) actieve taken — NIET automatisch
  const active = out.filter(t => isMergeable(t) && !consumed.has(t.id));
  const seen = new Set<string>();
  const suggestions: DedupSuggestion[] = [];
  for (let a = 0; a < active.length; a++) {
    for (let b = a + 1; b < active.length; b++) {
      const sim = jaccard(tokens(active[a].title), tokens(active[b].title));
      if (sim >= 0.5) {
        const pairKey = [active[a].id, active[b].id].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        suggestions.push({
          ids: [active[a].id, active[b].id],
          titles: [active[a].title, active[b].title],
          reason: `${Math.round(sim * 100)}% overlap`,
        });
      }
    }
  }
  suggestions.sort((x, y) => parseInt(y.reason) - parseInt(x.reason));
  return { tasks: out, mergedCount, suggestions: suggestions.slice(0, 8) };
}

// Expliciete merge (voor de merge_tasks patch vanuit de mentor-chat).
export function mergeExplicit(tasks: MentorTask[], ids: string[], into: string | undefined, now = new Date().toISOString().slice(0, 10)): MentorTask[] {
  const present = ids.filter(id => tasks.some(t => t.id === id));
  if (present.length < 2) return tasks;
  const targetId = into && present.includes(into)
    ? into
    : present.map(id => tasks.find(t => t.id === id)!).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))[0].id;
  const out = tasks.map(t => ({ ...t }));
  const ci = out.findIndex(t => t.id === targetId);
  if (ci < 0) return tasks;
  let canon: MentorTask = { ...out[ci], sources: ensureSources(out[ci]) };
  for (const id of present) {
    if (id === targetId) continue;
    const di = out.findIndex(t => t.id === id);
    if (di < 0) continue;
    canon = mergeTaskInto(canon, out[di], now);
    out[di] = closeAsMerged(out[di], canon, now);
  }
  out[ci] = canon;
  return out;
}

// ── Suggesties-opslag (data/dedup_suggestions.json) ───────────────────────────
function dataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR ? path.resolve(base, process.env.DATA_DIR) : path.join(base, "data");
}
export async function writeDedupSuggestions(s: DedupSuggestion[]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(path.join(dataDir(), "dedup_suggestions.json"), JSON.stringify(s, null, 2), "utf-8");
}
export async function readDedupSuggestions(): Promise<DedupSuggestion[]> {
  try { return JSON.parse(await fs.readFile(path.join(dataDir(), "dedup_suggestions.json"), "utf-8")) as DedupSuggestion[]; }
  catch { return []; }
}
