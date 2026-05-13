import type { MentorTask, CoveyQuadrant, DeadlinePressure, DeadlineType } from "../mentorTypes";
import { analyzeTask } from "./taskAnalyzer";

const STALE_SEED_IDS = [
  "task_malaga_reel_1_script",
  "task_malaga_reel_2_winactie_script",
  "task_malaga_shotlist",
  "task_malaga_hooks",
  "task_malaga_cta_winactie",
  "task_malaga_mirjam_vragen",
  "task_ai_video_analyzer",
];

function getDefaultLeadTime(tags: string[]): number {
  if (tags.some(t => ["samenwerking", "klant", "weeze"].includes(t))) return 3;
  if (tags.some(t => ["reis", "malaga", "opname", "script", "shotlist"].includes(t))) return 2;
  if (tags.some(t => ["tool", "dashboard", "ai-video-analyzer"].includes(t))) return 7;
  return 1;
}

export function migrateTasks(tasks: MentorTask[], todayISO: string): MentorTask[] {
  return tasks.map(task => {
    const tags = (task.tags ?? []).map(t => t.toLowerCase());
    const migrated = { ...task };

    // Move deadline to hardDeadline if missing
    if (!migrated.hardDeadline && migrated.deadline) {
      migrated.hardDeadline = migrated.deadline;
      migrated.deadlineType = "hard";
    }

    // Set leadTimeDays default
    if (migrated.leadTimeDays === undefined) {
      migrated.leadTimeDays = getDefaultLeadTime(tags);
    }

    // Compute startBy from hardDeadline - leadTimeDays
    if (!migrated.startBy && migrated.hardDeadline && migrated.leadTimeDays) {
      const dl = new Date(migrated.hardDeadline);
      dl.setDate(dl.getDate() - migrated.leadTimeDays);
      migrated.startBy = dl.toISOString().slice(0, 10);
    }

    // Flag stale seeds with past deadlines
    if (STALE_SEED_IDS.includes(migrated.id) && migrated.hardDeadline) {
      const dl = new Date(migrated.hardDeadline);
      if (dl < new Date(todayISO)) {
        if (!migrated.tags) migrated.tags = [];
        if (!migrated.tags.includes("stale_seed")) {
          migrated.tags = [...migrated.tags, "stale_seed"];
        }
      }
    }

    // Recompute coveyQuadrant
    const analysis = analyzeTask(migrated, { todayISO });
    migrated.coveyQuadrant = analysis.coveyQuadrant;
    migrated.urgencyScore = analysis.urgencyScore;
    migrated.importanceScore = analysis.importanceScore;
    migrated.deadlinePressure = analysis.deadlinePressure;

    return migrated;
  });
}

export function getStaleSeedWarnings(tasks: MentorTask[], todayISO: string): string[] {
  return tasks
    .filter(t => {
      if (t.status === "done" || t.status === "cancelled") return false;
      const deadline = t.hardDeadline ?? t.deadline;
      if (!deadline) return false;
      return new Date(deadline) < new Date(todayISO);
    })
    .map(t => `Taak "${t.title}" heeft een verlopen deadline (${t.hardDeadline ?? t.deadline}).`);
}
