import type { MentorTask, MentorPriority } from "../mentorTypes";
import { analyzeTask } from "./taskAnalyzer";

export function enforceP0Safety(tasks: MentorTask[]): MentorTask[] {
  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

  const hasExternalP0 = tasks.some(t => {
    if (t.status !== "open" && t.status !== "in_progress") return false;
    if (t.priority !== "P0") return false;
    return (t.tags ?? []).some(tag => ["weeze", "malaga", "klant", "samenwerking"].includes(tag));
  });

  if (!hasExternalP0) return tasks;

  return tasks.map(t => {
    if (t.priority !== "P0") return t;
    const isInternalTool = (t.tags ?? []).some(tag =>
      ["tool", "ai-video-analyzer", "dashboard", "intern"].includes(tag)
    );
    if (isInternalTool) {
      return { ...t, priority: "P2" as MentorPriority, updatedAt: new Date().toISOString().slice(0, 10) };
    }
    return t;
  });
}

export function computeTaskPriorities(tasks: MentorTask[]): MentorTask[] {
  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  return tasks.map(t => {
    const analysis = analyzeTask(t, { todayISO });
    return {
      ...t,
      coveyQuadrant: analysis.coveyQuadrant,
      urgencyScore: analysis.urgencyScore,
      importanceScore: analysis.importanceScore,
      deadlinePressure: analysis.deadlinePressure,
    };
  });
}
