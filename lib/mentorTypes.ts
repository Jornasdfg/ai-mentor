export type ModelProvider = "deepseek" | "openai";
export type MentorPriority = "P0" | "P1" | "P2" | "P3";
export type MentorTaskStatus = "open" | "in_progress" | "done" | "parked" | "cancelled";
export type MentorMode = "daily_triage" | "capture_input" | "weekly_review" | "reference_cleanup" | "mail_ingest";
export type MentorPatchOperation =
  | "add_task" | "update_task" | "park_task" | "complete_task" | "cancel_task"
  | "merge_tasks"
  | "add_context_note" | "add_decision" | "add_inbox_item" | "update_daily_focus";

// Herkomst van een taak — bewaard zodat we weten waar een taak vandaan komt en
// hoeveel bronnen dezelfde taak bevestigen (telt mee voor prioriteit).
export interface TaskSourceRef {
  source: string;   // "mail" | "airtable" | "manual_input" | "system" | "monthly_goal" | ...
  ref?: string;     // optionele sleutel: afzender, factuur-id, Airtable-record, etc.
  at: string;       // ISO datum waarop deze bron de taak (bevestigde)
}
export type CoveyQuadrant = "Q1" | "Q2" | "Q3" | "Q4";
export type DeadlinePressure = "overdue" | "today" | "tomorrow" | "this_week" | "future" | "none";
export type DeadlineType = "hard" | "soft" | "none";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";
export type CalendarSyncMode = "none" | "manual" | "auto";
export type CalendarSyncStatus =
  | "not_synced"
  | "pending_google"
  | "synced"
  | "external_changed"
  | "deleted_remote"
  | "conflict"
  | "error";

// ── Scheduler types ───────────────────────────────────────────────────────────
export type AutoScheduleMode = "off" | "auto";
// "appointment" = vast tijdstip, onverplaatsbaar (bv. afspraak Jordi woensdag) → telt als bezet.
// "task" = flexibele taak (bv. bonnen administratie) → wordt automatisch ingepland.
// "routine" = instance van een terugkerende routine → flexibel planbaar (vaak dag-gepind),
//             maar buiten de takenlijst/Covey gehouden; leeft alleen als blok in de planner.
export type TaskKind = "task" | "appointment" | "routine";
export type ScheduleColorState = "green" | "orange" | "red" | "gray";
export type ScheduleBlockStatus = "planned" | "locked" | "missed" | "unscheduled";
export type SchedulingWindowType = "work" | "personal" | "anytime";

export interface MentorCalendarLink {
  provider?: "google" | "calendarmcp";
  calendarId?: string | null;
  eventId?: string | null;
  htmlLink?: string | null;
  etag?: string | null;
  googleUpdatedAt?: string | null;
  lastSyncedAt?: string | null;
  lastSynced?: string | null;
  syncStatus?: CalendarSyncStatus;
  syncError?: string | null;
}

export interface CalendarEventView {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  source: "mentor_task" | "google_calendar";
  taskId?: string;
  calendarId?: string;
  htmlLink?: string | null;
  status?: string;
  description?: string | null;
}

export interface MentorRequest {
  userMessage: string;
  referenceContent?: string;
  mode?: MentorMode;
}

export interface MentorTask {
  id: string;
  title: string;
  project?: string;
  status: MentorTaskStatus;
  priority: MentorPriority;
  deadline?: string | null;
  hardDeadline?: string | null;
  softDeadline?: string | null;
  startBy?: string | null;
  leadTimeDays?: number;
  deadlineType?: DeadlineType;
  estimatedMinutes?: number;
  nextAction?: string;
  coveyQuadrant?: CoveyQuadrant;
  urgencyScore?: number;
  importanceScore?: number;
  deadlinePressure?: DeadlinePressure;
  blockedBy?: string[];
  dependsOn?: string[];
  completedAt?: string | null;
  cancelledAt?: string | null;
  parkedReason?: string;
  lastRecommendedAt?: string | null;
  recommendationCount?: number;
  history?: Array<{ at: string; type: string; note: string }>;
  source: "manual_input" | "daily_reference" | "mail" | "monthly_goal" | "system" | "recurring_manual" | "calendar";
  sources?: TaskSourceRef[];        // alle bronnen die deze taak (bevestigden) — dedup/merge
  mergedFrom?: string[];            // ids van taken die in deze taak zijn samengevoegd
  supersededBy?: string | null;     // als deze taak is samengevoegd in een andere: doel-id
  reason?: string;
  createdAt: string;
  updatedAt: string;
  lastSeen?: string;
  tags?: string[];
  recurrenceTemplateId?: string | null;
  recurrenceDate?: string | null;
  recurrenceKey?: string | null;
  isRecurringInstance?: boolean;
  plannedDate?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedMinutes?: number | null;
  calendarSyncMode?: CalendarSyncMode;
  calendarLink?: MentorCalendarLink | null;
  // Scheduler fields
  taskKind?: TaskKind;        // default "task"; "appointment" = vast tijdstip, niet auto-inplannen
  autoSchedule?: AutoScheduleMode;
  // Dag-pin: als gezet, mag de auto-scheduler deze flexibele taak ALLEEN op deze datum
  // plaatsen (YYYY-MM-DD). Tijd blijft flexibel. Gebruikt voor routines die op een vaste
  // dag horen (bv. wekelijkse analyse → elke maandag).
  scheduleOnDate?: string | null;
  schedulingWindowId?: string | null;
  minBlockMinutes?: number;
  splittable?: boolean;
  autoIgnore?: boolean;
  locked?: boolean;
  manualSortOrder?: number;
  scheduleColorState?: ScheduleColorState;
  scheduleStatus?: ScheduleBlockStatus;
  unscheduledReason?: string | null;
}

export interface MentorRecurringTask {
  id: string;
  title: string;
  project?: string;
  frequency: RecurrenceFrequency;
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  priority: MentorPriority;
  leadTimeDays?: number;
  estimatedMinutes?: number;
  nextAction?: string;
  tags?: string[];
  hardDeadlineOffsetDays?: number;
  softDeadlineOffsetDays?: number;
  executionMode: "manual" | "mcp_ready";
  futureMcpAction?: string;
  defaultPlannedTime?: string | null;
  defaultDurationMinutes?: number | null;
  // Als true: instances worden NIET op een vast tijdstip gezet, maar flexibel auto-gepland
  // én vastgepind op hun occurrence-datum (scheduleOnDate). Zo blijft een wekelijkse routine
  // op zijn dag (bv. maandag) maar mag de planner de tijd binnen die dag kiezen.
  pinToOccurrenceDate?: boolean;
  calendarSyncMode?: CalendarSyncMode;
  calendarTitleTemplate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAnalysis {
  taskId: string;
  urgencyScore: number;
  importanceScore: number;
  coveyQuadrant: CoveyQuadrant;
  computedPriority: MentorPriority;
  deadlinePressure: DeadlinePressure;
  shouldSurfaceToday: boolean;
  shouldPrepareSoon: boolean;
  reason: string;
}

export interface MentorDecision {
  id: string;
  date: string;
  decision: string;
  reason: string;
  effect?: string;
  relatedTaskIds?: string[];
}

export interface MentorInboxItem {
  id: string;
  createdAt: string;
  source: "jorn" | "system" | "mail";
  rawInput: string;
  status: "new" | "processed" | "ignored";
  detectedSignals?: string[];
  linkedTaskIds?: string[];
}

export interface MentorConversationItem {
  id: string;
  createdAt: string;
  userMessage: string;
  assistantSummary: string;
  recommendedTaskIds: string[];
  topPriorityTaskId?: string;
  decisionsMade: string[];
  patchesProposed: MentorPatch[];
  patchesApplied: MentorPatch[];
}

export interface MentorConflict {
  type: "priority_conflict" | "duplicate_task" | "missing_context" | "deadline_conflict";
  oldValue?: string;
  newValue?: string;
  resolution: string;
}

export interface MentorPatch {
  operation: MentorPatchOperation;
  taskId?: string;
  target?: string;
  reason?: string;
  data: Record<string, unknown>;
}

export interface MentorState {
  tasks: MentorTask[];
  decisions: MentorDecision[];
  inboxItems: MentorInboxItem[];
}

export interface ParsedMentorOutput {
  adviceText: string;
  topPriority?: { title: string; reason: string };
  todayTasks: Array<{ title: string; priority: MentorPriority; timeEstimate?: string; reason: string }>;
  doNotDo: Array<{ title: string; reason: string }>;
  parked: Array<{ title: string; reason: string }>;
  upcomingWarnings: Array<{ taskId?: string; title: string; daysUntilDeadline?: number; message: string }>;
  conflicts: MentorConflict[];
  proposedPatches: MentorPatch[];
  updatedReference: null;
  rawOutput: string;
  parseError?: string;
}

export interface MentorAdvice {
  adviceText: string;
  updatedReference: null;
  rawOutput: string;
  topPriority?: { title: string; reason: string };
  todayTasks?: Array<{ title: string; priority: MentorPriority; timeEstimate?: string; reason: string }>;
  doNotDo?: Array<{ title: string; reason: string }>;
  parked?: Array<{ title: string; reason: string }>;
  upcomingWarnings?: Array<{ taskId?: string; title: string; daysUntilDeadline?: number; message: string }>;
  conflicts?: MentorConflict[];
  proposedPatches?: MentorPatch[];
  appliedPatchesCount?: number;
  stateSummary?: { openTasks: number; p0Count: number; p1Count: number };
  taskAnalyses?: TaskAnalysis[];
  parseError?: string;
  conversationContextUsed?: boolean;
}

export interface MailAction {
  id: string;
  source: "gmail";
  emailId?: string;
  from?: string;
  subject?: string;
  topic: string;
  detectedCommitments: string[];
  deadline?: string | null;
  priority: MentorPriority;
  reason: string;
  status: "open" | "done" | "parked";
  createdAt: string;
}

export interface ReferenceVersion {
  id: string;
  label: string;
  content: string;
  savedAt: string;
}

export interface ReferenceState {
  current: string;
  lastSaved: string | null;
  isDirty: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ── Scheduler interfaces ──────────────────────────────────────────────────────

export interface SchedulingWindow {
  id: string;
  name: string;
  type: SchedulingWindowType;
  daysOfWeek: number[]; // 1=Mon..7=Sun (ISO weekday)
  startTime: string;    // "HH:MM"
  endTime: string;      // "HH:MM"
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleBlock {
  id: string;
  taskId: string;
  title: string;
  start: string;           // "YYYY-MM-DDTHH:MM:SS" local Amsterdam
  end: string;
  durationMinutes: number;
  status: ScheduleBlockStatus;
  colorState: ScheduleColorState;
  source: "auto_scheduler" | "manual_drag" | "manual_plan";
  locked: boolean;
  schedulingWindowId?: string | null;
  calendarEventId?: string | null;
  calendarId?: string | null;
  calendarSynced: boolean;
  runId?: string | null;
  unscheduledReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRun {
  id: string;
  triggeredBy: "task_created" | "task_updated" | "google_webhook" | "worker_repair" | "manual" | "task_completed";
  startedAt: string;
  finishedAt: string | null;
  horizonDays: number;
  blocksCreated: number;
  blocksRemoved: number;
  warnings: string[];
  status: "running" | "done" | "error";
  errorMessage?: string | null;
}

// ── Wekelijkse analyse ─────────────────────────────────────────────────────────
// Compacte retrospective die elke maandag door de losse routine wordt gegenereerd
// op basis van de live taakdata. Bewust klein gehouden: de mentor krijgt alleen
// de samenvatting + topfocus mee (token-zuinig), niet de volledige metrics.
export interface WeeklyReview {
  generatedAt: string;            // ISO tijdstip van generatie
  weekStart: string;              // YYYY-MM-DD (maandag van de geanalyseerde week)
  weekEnd: string;                // YYYY-MM-DD (zondag van de geanalyseerde week)
  summary: string;                // 1-3 zinnen kernconclusie (token-zuinig)
  highlights?: string[];          // wat ging goed / opviel (max ~5)
  focusNextWeek?: string[];       // 1-3 concrete focuspunten voor de nieuwe week
  metrics?: {
    completed?: number;           // afgeronde taken vorige week
    created?: number;             // nieuw aangemaakte taken
    overdue?: number;             // taken met verstreken harde deadline
    openP0?: number;              // open P0 die de nieuwe week ingaan
    openP1?: number;
    byProject?: Record<string, number>;  // afgerond per project
  };
  source?: string;                // bv. "monday-routine"
}