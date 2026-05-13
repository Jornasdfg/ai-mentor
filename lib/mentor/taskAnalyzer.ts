import type { MentorTask, TaskAnalysis, CoveyQuadrant, DeadlinePressure, MentorPriority } from "../mentorTypes";

function getDefaultLeadTime(tags: string[]): number {
  if (tags.some(t => ["samenwerking", "klant", "weeze"].includes(t))) return 3;
  if (tags.some(t => ["reis", "malaga", "opname", "script", "shotlist", "vlucht"].includes(t))) return 2;
  if (tags.some(t => ["tool", "dashboard", "ai-video-analyzer"].includes(t))) return 7;
  return 1;
}

function buildReason(
  urgency: number,
  importance: number,
  quadrant: CoveyQuadrant,
  pressure: DeadlinePressure,
  task: MentorTask
): string {
  const parts: string[] = [];
  if (pressure === "overdue") parts.push("deadline verstreken");
  else if (pressure === "today") parts.push("deadline vandaag");
  else if (pressure === "tomorrow") parts.push("deadline morgen");
  else if (pressure === "this_week") parts.push("deadline deze week");
  if ((task.tags ?? []).some(t => ["klant", "weeze", "samenwerking"].includes(t))) parts.push("externe samenwerking");
  if ((task.tags ?? []).some(t => ["reis", "malaga", "opname"].includes(t))) parts.push("reis/opname");
  parts.push(`Q${quadrant[1]}: urgentie ${urgency}, belang ${importance}`);
  return parts.join(" · ");
}

export function analyzeTask(task: MentorTask, context: { todayISO: string }): TaskAnalysis {
  const tags = (task.tags ?? []).map(t => t.toLowerCase());
  const today = new Date(context.todayISO);

  // Effective deadline: hardDeadline > deadline
  const effectiveDeadline = task.hardDeadline ?? task.deadline ?? null;

  let deadlinePressure: DeadlinePressure = "none";
  let deadlineDays = Infinity;

  if (effectiveDeadline) {
    const dl = new Date(effectiveDeadline);
    deadlineDays = Math.ceil((dl.getTime() - today.getTime()) / 86400000);
    if (deadlineDays < 0) deadlinePressure = "overdue";
    else if (deadlineDays === 0) deadlinePressure = "today";
    else if (deadlineDays === 1) deadlinePressure = "tomorrow";
    else if (deadlineDays <= 7) deadlinePressure = "this_week";
    else deadlinePressure = "future";
  }

  // Urgency score 0-100
  let urgencyScore = 0;
  if (deadlinePressure === "overdue") urgencyScore = 100;
  else if (deadlinePressure === "today") urgencyScore = 90;
  else if (deadlinePressure === "tomorrow") urgencyScore = 80;
  else if (deadlinePressure === "this_week") urgencyScore = 60;
  else if (deadlinePressure === "future") {
    const leadTime = task.leadTimeDays ?? getDefaultLeadTime(tags);
    urgencyScore = deadlineDays <= leadTime ? 50 : 20;
  }

  // Check startBy override
  if (task.startBy) {
    const sb = new Date(task.startBy);
    if (today >= sb && urgencyScore < 50) urgencyScore = Math.max(urgencyScore, 50);
  }

  // Parked tasks get low urgency
  if (task.status === "parked" || task.status === "done" || task.status === "cancelled") {
    urgencyScore = Math.min(urgencyScore, 10);
  }

  // Importance score 0-100
  let importanceScore = 20; // base
  if (tags.some(t => ["klant", "samenwerking", "weeze"].includes(t))) importanceScore += 40;
  if (tags.some(t => ["malaga", "reis", "opname", "vlucht"].includes(t))) importanceScore += 40;
  if (tags.some(t => ["script", "shotlist", "hooks", "cta", "winactie"].includes(t))) importanceScore += 20;
  if (task.source === "monthly_goal") importanceScore += 30;
  if (
    tags.some(t => ["tool", "ai-video-analyzer", "dashboard", "intern"].includes(t)) &&
    !effectiveDeadline
  ) {
    importanceScore = Math.max(0, importanceScore - 20);
  }
  importanceScore = Math.min(100, importanceScore);

  // Covey quadrant
  const isUrgent = urgencyScore >= 60;
  const isImportant = importanceScore >= 50;
  let coveyQuadrant: CoveyQuadrant;
  if (isUrgent && isImportant) coveyQuadrant = "Q1";
  else if (!isUrgent && isImportant) coveyQuadrant = "Q2";
  else if (isUrgent && !isImportant) coveyQuadrant = "Q3";
  else coveyQuadrant = "Q4";

  // Priority mapping
  const computedPriority: MentorPriority =
    coveyQuadrant === "Q1" ? "P0" :
    coveyQuadrant === "Q2" ? "P1" :
    coveyQuadrant === "Q3" ? "P2" : "P3";

  const shouldSurfaceToday = urgencyScore >= 60 || (urgencyScore >= 50 && importanceScore >= 60);
  const shouldPrepareSoon = !shouldSurfaceToday && urgencyScore >= 40 && importanceScore >= 50;

  return {
    taskId: task.id,
    urgencyScore,
    importanceScore,
    coveyQuadrant,
    computedPriority,
    deadlinePressure,
    shouldSurfaceToday,
    shouldPrepareSoon,
    reason: buildReason(urgencyScore, importanceScore, coveyQuadrant, deadlinePressure, task),
  };
}

export function analyzeAllTasks(tasks: MentorTask[], todayISO: string): TaskAnalysis[] {
  return tasks
    .filter(t => t.status !== "done" && t.status !== "cancelled")
    .map(t => analyzeTask(t, { todayISO }));
}
