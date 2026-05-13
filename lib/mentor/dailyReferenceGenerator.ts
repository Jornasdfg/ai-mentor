import type { MentorTask, MentorDecision, TaskAnalysis } from "../mentorTypes";
import { writeReference } from "../storage/referenceStorage";
import { saveVersion } from "../storage/versionStorage";
import { analyzeTask } from "./taskAnalyzer";

function getTodayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function getTodayNL(): string {
  return new Date().toLocaleDateString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmt(t: MentorTask): string {
  const deadlineStr = t.hardDeadline
    ? ` | harde deadline: ${t.hardDeadline}`
    : t.deadline
    ? ` | deadline: ${t.deadline}`
    : "";
  const softStr = t.softDeadline ? ` | zacht: ${t.softDeadline}` : "";
  const timeStr = t.estimatedMinutes ? ` | ~${t.estimatedMinutes}min` : "";
  const routineStr = t.isRecurringInstance ? " | routine" : "";
  const nextStr = t.nextAction ? `\n  → ${t.nextAction}` : "";
  return `- **${t.title}**${t.project ? ` (${t.project})` : ""}${deadlineStr}${softStr}${timeStr}${routineStr}${nextStr}`;
}

export function generateDailyReference(tasks: MentorTask[], decisions: MentorDecision[]): string {
  const todayISO = getTodayISO();
  const todayNL = getTodayNL();

  const analyses = tasks
    .filter(t => t.status !== "done" && t.status !== "cancelled")
    .map(t => ({ task: t, analysis: analyzeTask(t, { todayISO }) }));

  const q1 = analyses.filter(a => a.analysis.coveyQuadrant === "Q1");
  const q2 = analyses.filter(a => a.analysis.coveyQuadrant === "Q2");
  const q3 = analyses.filter(a => a.analysis.coveyQuadrant === "Q3");
  const q4 = analyses.filter(a => a.analysis.coveyQuadrant === "Q4" || a.task.status === "parked");

  const mustDo = analyses.filter(a => a.analysis.shouldSurfaceToday);
  const prepareSoon = analyses.filter(a => a.analysis.shouldPrepareSoon);

  const commitments = [
    ...new Set(
      tasks
        .filter(t => (t.tags ?? []).some(tag => ["weeze", "klant", "samenwerking"].includes(tag)) && t.status === "open")
        .map(t => t.project ?? t.title)
    ),
  ];

  const upcoming = analyses
    .filter(a => {
      const d = a.task.hardDeadline ?? a.task.deadline;
      if (!d) return false;
      const days = Math.ceil((new Date(d).getTime() - new Date(todayISO).getTime()) / 86400000);
      return days > 0 && days <= 7;
    })
    .sort((a, b) => {
      const da = a.task.hardDeadline ?? a.task.deadline ?? "";
      const db = b.task.hardDeadline ?? b.task.deadline ?? "";
      return da.localeCompare(db);
    });

  return `# Daily Reference — AI Mentor
Laatste update: ${todayNL}

## Vandaag niet onderhandelbaar
${mustDo.length > 0 ? mustDo.map(a => fmt(a.task)).join("\n") : "_Geen dwingende taken vandaag._"}

## Vandaag voorbereiden (komt eraan)
${prepareSoon.length > 0 ? prepareSoon.map(a => fmt(a.task)).join("\n") : "_Niets dat vandaag voorbereiding nodig heeft._"}

## Covey Matrix

### Q1 — Nu doen (urgent + belangrijk)
${q1.length > 0 ? q1.map(a => fmt(a.task)).join("\n") : "_Leeg_"}

### Q2 — Plannen (belangrijk, niet urgent)
${q2.length > 0 ? q2.map(a => fmt(a.task)).join("\n") : "_Leeg_"}

### Q3 — Beperken (urgent, minder belangrijk)
${q3.length > 0 ? q3.map(a => fmt(a.task)).join("\n") : "_Leeg_"}

### Q4 — Parkeren (niet urgent, niet belangrijk)
${q4.length > 0 ? q4.slice(0, 5).map(a => fmt(a.task)).join("\n") : "_Leeg_"}

## Komt eraan (deze week)
${upcoming.length > 0 ? upcoming.map(a => {
  const d = a.task.hardDeadline ?? a.task.deadline ?? "";
  const days = Math.ceil((new Date(d).getTime() - new Date(todayISO).getTime()) / 86400000);
  return `- ${a.task.title} — over ${days} dag${days === 1 ? "" : "en"}`;
}).join("\n") : "_Geen komende deadlines._"}

## Actieve commitments
${commitments.length > 0 ? commitments.map(c => `- ${c}`).join("\n") : "_Geen actieve commitments._"}

## Routines deze week
${(() => {
  const routines = analyses
    .filter(a => {
      if (!a.task.isRecurringInstance) return false;
      const d = a.task.recurrenceDate ?? a.task.hardDeadline ?? a.task.deadline;
      if (!d) return false;
      const days = Math.ceil((new Date(d).getTime() - new Date(todayISO).getTime()) / 86400000);
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => {
      const da = a.task.recurrenceDate ?? a.task.hardDeadline ?? "";
      const db = b.task.recurrenceDate ?? b.task.hardDeadline ?? "";
      return da.localeCompare(db);
    });
  return routines.length > 0
    ? routines.map(a => fmt(a.task)).join("\n")
    : "_Geen routines deze week._";
})()}

## Laatste beslissingen
${decisions.slice(0, 3).map(d => `- ${d.date}: ${d.decision}`).join("\n") || "_Geen beslissingen gelogd._"}
`;
}

export async function regenerateDailyReference(
  tasks: MentorTask[],
  decisions: MentorDecision[]
): Promise<void> {
  const content = generateDailyReference(tasks, decisions);
  await saveVersion(content);
  await writeReference(content);
}
