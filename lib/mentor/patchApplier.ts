import type { MentorPatch, MentorState, MentorTask, MentorDecision, MentorInboxItem, TaskSourceRef } from "../mentorTypes";
import { mergeExplicit } from "./taskDedup";

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function bumpForSources(p: MentorTask["priority"], sources: TaskSourceRef[]): MentorTask["priority"] {
  const distinct = new Set(sources.map(s => s.ref ? `${s.source}:${s.ref}` : s.source)).size;
  if (distinct < 2) return p;
  if (p === "P3") return "P2";
  if (p === "P2") return "P1";
  return p;
}

export function applyMentorPatches(currentState: MentorState, patches: MentorPatch[]): MentorState {
  let tasks = currentState.tasks.map(t => ({ ...t }));
  const decisions = [...currentState.decisions];
  const inboxItems = [...currentState.inboxItems];

  for (const patch of patches) {
    const now = new Date().toISOString().slice(0, 10);

    switch (patch.operation) {
      case "add_task": {
        const d = patch.data as Partial<MentorTask>;
        if (!d.title) break;
        // Match by title regardless of status (including cancelled) to avoid duplicates
        const existingIdx = tasks.findIndex(
          t =>
            t.title.toLowerCase() === d.title!.toLowerCase() &&
            t.project === d.project &&
            t.status !== "done"
        );
        if (existingIdx >= 0) {
          const existing = tasks[existingIdx];
          const newPrio = d.priority ?? existing.priority;
          // Reopen cancelled/parked tasks if AI is adding them again
          const newStatus = existing.status === "cancelled" || existing.status === "parked" ? "open" : existing.status;
          tasks[existingIdx] = {
            ...existing,
            status: newStatus,
            priority: PRIORITY_ORDER[newPrio] < PRIORITY_ORDER[existing.priority] ? newPrio : existing.priority,
            updatedAt: now,
          };
          if (d.estimatedMinutes !== undefined) {
            tasks[existingIdx] = { ...tasks[existingIdx], estimatedMinutes: d.estimatedMinutes, updatedAt: now };
          }
          if (d.nextAction) {
            tasks[existingIdx] = { ...tasks[existingIdx], nextAction: d.nextAction, updatedAt: now };
          }
          if (d.coveyQuadrant) {
            tasks[existingIdx] = { ...tasks[existingIdx], coveyQuadrant: d.coveyQuadrant, updatedAt: now };
          }
          if (d.plannedStart) {
            tasks[existingIdx] = {
              ...tasks[existingIdx],
              plannedStart: d.plannedStart,
              plannedEnd: d.plannedEnd ?? undefined,
              plannedMinutes: d.plannedMinutes ?? d.estimatedMinutes,
              updatedAt: now,
            };
          }
          // Bron registreren + prioriteit ophogen als meerdere bronnen dit bevestigen
          const ex = tasks[existingIdx];
          const srcs: TaskSourceRef[] = [...(ex.sources ?? [{ source: ex.source ?? "manual_input", at: ex.createdAt ?? now }])];
          const incSource = (d.source as string) ?? "manual_input";
          if (!srcs.some(s => s.source === incSource)) srcs.push({ source: incSource, at: now });
          tasks[existingIdx] = {
            ...ex,
            sources: srcs,
            priority: bumpForSources(ex.priority, srcs),
            history: [...(ex.history ?? []), { at: now, type: "confirm", note: `Bevestigd via ${incSource}` }],
            updatedAt: now,
          };
        } else {
          tasks.push({
            id: d.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: d.title,
            project: d.project,
            status: d.status ?? "open",
            priority: d.priority ?? "P2",
            coveyQuadrant: d.coveyQuadrant,
            deadline: d.deadline ?? null,
            hardDeadline: d.hardDeadline ?? d.deadline ?? null,
            softDeadline: d.softDeadline ?? null,
            startBy: d.startBy ?? null,
            leadTimeDays: d.leadTimeDays,
            deadlineType: d.deadlineType ?? (d.hardDeadline ? "hard" : "none"),
            estimatedMinutes: d.estimatedMinutes,
            nextAction: d.nextAction,
            plannedStart: d.plannedStart,
            plannedEnd: d.plannedEnd,
            plannedMinutes: d.plannedMinutes ?? d.estimatedMinutes,
            source: d.source ?? "manual_input",
            sources: [{ source: d.source ?? "manual_input", at: d.createdAt ?? now }],
            reason: d.reason,
            createdAt: d.createdAt ?? now,
            updatedAt: now,
            tags: d.tags ?? [],
          });
        }
        break;
      }
      case "update_task": {
        const idx = tasks.findIndex(t => t.id === patch.taskId);
        if (idx >= 0) {
          const allowed = [
            "priority", "status", "deadline", "hardDeadline", "softDeadline",
            "startBy", "leadTimeDays", "deadlineType", "estimatedMinutes",
            "nextAction", "reason", "tags", "lastSeen", "parkedReason",
            "coveyQuadrant", "plannedStart", "plannedEnd", "plannedMinutes",
          ];
          const safeUpdate = Object.fromEntries(
            Object.entries(patch.data).filter(([k]) => allowed.includes(k))
          );
          tasks[idx] = { ...tasks[idx], ...safeUpdate, updatedAt: now };
          if (safeUpdate.status === "done") tasks[idx].completedAt = new Date().toISOString();
          if (safeUpdate.status === "cancelled") tasks[idx].cancelledAt = new Date().toISOString();
        }
        break;
      }
      case "park_task": {
        const idx = tasks.findIndex(t => t.id === patch.taskId);
        if (idx >= 0 && (tasks[idx].status === "open" || tasks[idx].status === "in_progress")) {
          tasks[idx] = {
            ...tasks[idx],
            status: "parked",
            priority: "P3",
            parkedReason: patch.reason,
            updatedAt: now,
          };
        }
        break;
      }
      case "merge_tasks": {
        const ids = (patch.data.ids as string[] | undefined) ?? [];
        const into = patch.target ?? (patch.data.into as string | undefined);
        if (Array.isArray(ids) && ids.length >= 2) {
          tasks = mergeExplicit(tasks, ids, into, now);
        }
        break;
      }
      case "complete_task": {
        const idx = tasks.findIndex(t => t.id === patch.taskId);
        if (idx >= 0) {
          tasks[idx] = {
            ...tasks[idx], status: "done", completedAt: new Date().toISOString(),
            history: [...(tasks[idx].history ?? []), { at: now, type: "complete", note: patch.reason ?? "Afgerond via mentor" }],
            updatedAt: now,
          };
        }
        break;
      }
      case "cancel_task": {
        const idx = tasks.findIndex(t => t.id === patch.taskId);
        if (idx >= 0) {
          tasks[idx] = {
            ...tasks[idx], status: "cancelled", cancelledAt: new Date().toISOString(),
            history: [...(tasks[idx].history ?? []), { at: now, type: "cancel", note: patch.reason ?? "Geannuleerd via mentor" }],
            updatedAt: now,
          };
        }
        break;
      }
      case "add_decision": {
        const d = patch.data as Partial<MentorDecision>;
        if (!d.decision) break;
        decisions.unshift({
          id: d.id ?? `dec_${Date.now()}`,
          date: d.date ?? now,
          decision: d.decision,
          reason: d.reason ?? "",
          effect: d.effect,
          relatedTaskIds: d.relatedTaskIds ?? [],
        });
        if (decisions.length > 50) decisions.splice(50);
        break;
      }
      case "add_inbox_item": {
        const d = patch.data as Partial<MentorInboxItem>;
        if (!d.rawInput) break;
        inboxItems.unshift({
          id: d.id ?? `inbox_${Date.now()}`,
          createdAt: d.createdAt ?? new Date().toISOString(),
          source: d.source ?? "jorn",
          rawInput: d.rawInput,
          status: "processed",
          detectedSignals: d.detectedSignals ?? [],
          linkedTaskIds: d.linkedTaskIds ?? [],
        });
        if (inboxItems.length > 100) inboxItems.splice(100);
        break;
      }
      case "add_context_note":
      case "update_daily_focus":
        break;
    }
  }

  return { tasks, decisions, inboxItems };
}

export const applyProposedPatches = applyMentorPatches;

const SAFE_OPS = ["add_inbox_item", "add_task", "add_decision", "add_context_note", "park_task", "merge_tasks"];
const CONDITIONAL_SAFE = ["update_task"];

export function filterSafePatches(patches: MentorPatch[]): MentorPatch[] {
  return patches.filter(p => {
    if (SAFE_OPS.includes(p.operation)) return true;
    if (CONDITIONAL_SAFE.includes(p.operation)) {
      const d = p.data as Record<string, unknown>;
      if (d.status === "done" || d.status === "cancelled") return false;
      return true;
    }
    return false;
  });
}
