export type ModelProvider = "deepseek" | "openai";
export type MentorPriority = "P0" | "P1" | "P2" | "P3";
export type MentorTaskStatus = "open" | "in_progress" | "done" | "parked" | "cancelled";
export type MentorMode = "daily_triage" | "capture_input" | "weekly_review" | "reference_cleanup" | "mail_ingest";
export type MentorPatchOperation =
  | "add_task" | "update_task" | "park_task" | "complete_task" | "cancel_task"
  | "add_context_note" | "add_decision" | "add_inbox_item" | "update_daily_focus";
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

export interface MentorCalendarLink {
  provider?: "google" | "calendarmcp";
  calendarId?: string | null;
  eventId?: string | null;
  htmlLink?: string | null;
  etag?: string | null;
  googleUpdatedAt?: string | null;
  // lastSyncedAt is canonical; lastSynced kept for backward compat with existing tasks
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
  // Backward compat deadline field
  deadline?: string | null;
  // New deadline fields
  hardDeadline?: string | null;
  softDeadline?: string | null;
  startBy?: string | null;
  leadTimeDays?: number;
  deadlineType?: DeadlineType;
  // Time / planning
  estimatedMinutes?: number;
  nextAction?: string;
  // Scoring (computed, not stored by AI)
  coveyQuadrant?: CoveyQuadrant;
  urgencyScore?: number;
  importanceScore?: number;
  deadlinePressure?: DeadlinePressure;
  // Dependencies
  blockedBy?: string[];
  dependsOn?: string[];
  // Lifecycle
  completedAt?: string | null;
  cancelledAt?: string | null;
  parkedReason?: string;
  lastRecommendedAt?: string | null;
  recommendationCount?: number;
  // History log
  history?: Array<{ at: string; type: string; note: string }>;
  // Source
  source: "manual_input" | "daily_reference" | "mail" | "monthly_goal" | "system" | "recurring_manual" | "calendar";
  reason?: string;
  createdAt: string;
  updatedAt: string;
  lastSeen?: string;
  tags?: string[];
  // Recurring instance fields
  recurrenceTemplateId?: string | null;
  recurrenceDate?: string | null;
  recurrenceKey?: string | null;
  isRecurringInstance?: boolean;
  // Calendar / planning fields
  plannedDate?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedMinutes?: number | null;
  calendarSyncMode?: CalendarSyncMode;
  calendarLink?: MentorCalendarLink | null;
}

export interface MentorRecurringTask {
  id: string;
  title: string;
  project?: string;
  frequency: RecurrenceFrequency;
  interval: number;                // every N days/weeks/months
  daysOfWeek?: number[];           // 0=Sun..6=Sat — used for weekly
  dayOfMonth?: number;             // 1-31 — used for monthly
  startDate: string;               // YYYY-MM-DD
  endDate?: string | null;         // YYYY-MM-DD
  isActive: boolean;
  priority: MentorPriority;
  leadTimeDays?: number;
  estimatedMinutes?: number;
  nextAction?: string;
  tags?: string[];
  hardDeadlineOffsetDays?: number; // offset from occurrenceDate → hardDeadline
  softDeadlineOffsetDays?: number; // offset from occurrenceDate → softDeadline
  executionMode: "manual" | "mcp_ready";
  futureMcpAction?: string;
  defaultPlannedTime?: string | null;
  defaultDurationMinutes?: number | null;
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
