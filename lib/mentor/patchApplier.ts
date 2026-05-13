import type { MentorPatch, MentorState, MentorTask, MentorDecision, MentorInboxItem } from "../mentorTypes";

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

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
        const existingIdx = tasks.findIndex(
          t =>
            t.title.toLowerCase() === d.title!.toLowerCase() &&
            t.project === d.project &&
            t.status !== "done" &&
            t.status !== "cancelled"
        );
        if (existingIdx >= 0) {
          const existing = tasks[existingIdx];
          const newPrio = d.priority ?? existing.priority;
          if (PRIORITY_ORDER[newPrio] < PRIORITY_ORDER[existing.priority]) {
            tasks[existingIdx] = { ...existing, priority: newPrio, updatedAt: now };
          }
          // Update estimatedMinutes or nextAction if provided
          if (d.estimatedMinutes !== undefined) {
            tasks[existingIdx] = { ...tasks[existingIdx], estimatedMinutes: d.estimatedMinutes, updatedAt: now };
          }
          if (d.nextAction) {
            tasks[existingIdx] = { ...tasks[existingIdx], nextAction: d.nextAction, updatedAt: now };
          }
        } else {
          tasks.push({
            id: d.id ?? `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: d.title,
            project: d.project,
            status: d.status ?? "open",
            priority: d.priority ?? "P2",
            deadline: d.deadline ?? null,
            hardDeadline: d.hardDeadline ?? d.deadline ?? null,
            softDeadline: d.softDeadline ?? null,
            startBy: d.startBy ?? null,
            leadTimeDays: d.leadTimeDays,
            deadlineType: d.deadlineType ?? (d.hardDeadline ? "hard" : "none"),
            estimatedMinutes: d.estimatedMinutes,
            nextAction: d.nextAction,
            source: d.source ?? "manual_input",
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
            "nextAction", "reason", "tags", "lastSeen", "parkedReason"
          ];
          const safeUpdate = Object.fromEntries(
            Object.entries(patch.data).filter(([k]) => allowed.includes(k))
          );
          // Block done/cancelled via AI
          if (safeUpdate.status === "done" || safeUpdate.status === "cancelled") break;
          tasks[idx] = { ...tasks[idx], ...safeUpdate, updatedAt: now };
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
      case "complete_task":
      case "cancel_task":
        // Never auto-apply from AI
        break;
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

const SAFE_OPS = ["add_inbox_item", "add_task", "add_decision", "add_context_note", "park_task"];
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
