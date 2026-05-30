"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { MentorTask, CoveyQuadrant, MentorRecurringTask } from "@/lib/mentorTypes";
import TaskCard from "./TaskCard";
import TaskEditorModal from "./TaskEditorModal";
import TaskCreateModal from "./TaskCreateModal";
import RecurringTaskModal from "./RecurringTaskModal";
import RecurringTasksPanel from "./RecurringTasksPanel";

interface TaskBoardProps {
  tasks: MentorTask[];
  onTasksChange: () => void;
}

type BoardView = "covey" | "agenda";

const COLS: { key: CoveyQuadrant; label: string; sub: string; textCls: string; dropCls: string }[] = [
  { key: "Q1", label: "Q1", sub: "Urgent & Belangrijk",         textCls: "text-red-600",    dropCls: "ring-red-500/40 bg-red-950/20"    },
  { key: "Q2", label: "Q2", sub: "Niet Urgent & Belangrijk",    textCls: "text-blue-700",   dropCls: "ring-blue-500/40 bg-blue-950/20"  },
  { key: "Q3", label: "Q3", sub: "Urgent & Onbelangrijk",       textCls: "text-orange-700", dropCls: "ring-orange-500/40 bg-orange-950/20" },
  { key: "Q4", label: "Q4", sub: "Niet Urgent & Onbelangrijk",  textCls: "text-zinc-600",   dropCls: "ring-zinc-500/40 bg-white/30"  },
];

const PRIO_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function sortTasks(list: MentorTask[]): MentorTask[] {
  return [...list].sort((a, b) => {
    const d = (PRIO_ORDER[a.priority] ?? 3) - (PRIO_ORDER[b.priority] ?? 3);
    if (d !== 0) return d;
    return (a.hardDeadline ?? a.deadline ?? "9999").localeCompare(b.hardDeadline ?? b.deadline ?? "9999");
  });
}

// ── Agenda helpers ─────────────────────────────────────────────────────────────

type ScheduleType = "timed" | "scheduled" | "deadline" | "flexible";

function getScheduleType(task: MentorTask): ScheduleType {
  if (task.source === "calendar") return "timed";
  if (task.plannedStart) return "scheduled";
  if (task.hardDeadline ?? task.deadline) return "deadline";
  return "flexible";
}

function getTaskSortDate(task: MentorTask): string {
  return task.plannedStart?.slice(0, 10)
    ?? task.hardDeadline
    ?? task.softDeadline
    ?? task.deadline
    ?? "9999-12-31";
}

interface AgendaGroup {
  key: string;
  label: string;
  headerCls: string;
  tasks: MentorTask[];
}

const NL_DAYS   = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const NL_MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function fmtDateShort(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]}`;
}

function addDaysISO(base: Date, n: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function getAgendaGroups(tasks: MentorTask[]): AgendaGroup[] {
  const now      = new Date();
  const today    = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const in3days  = addDaysISO(now, 3);
  const in7days  = addDaysISO(now, 7);
  const in14days = addDaysISO(now, 14);

  const buckets: Record<string, MentorTask[]> = {
    overdue: [], today: [], soon: [], thisWeek: [], later2w: [], later: [], flexible: [],
  };

  for (const task of tasks) {
    const sd = getTaskSortDate(task);
    if (sd === "9999-12-31")  buckets.flexible.push(task);
    else if (sd < today)      buckets.overdue.push(task);
    else if (sd === today)    buckets.today.push(task);
    else if (sd <= in3days)   buckets.soon.push(task);
    else if (sd <= in7days)   buckets.thisWeek.push(task);
    else if (sd <= in14days)  buckets.later2w.push(task);
    else                      buckets.later.push(task);
  }

  function sortBucket(list: MentorTask[]) {
    return [...list].sort((a, b) => {
      const da = getTaskSortDate(a), db = getTaskSortDate(b);
      if (da !== db) return da.localeCompare(db);
      return (PRIO_ORDER[a.priority] ?? 3) - (PRIO_ORDER[b.priority] ?? 3);
    });
  }

  return [
    { key: "overdue",  label: "Te laat",                                      headerCls: "text-red-500",   tasks: sortBucket(buckets.overdue)  },
    { key: "today",    label: `Vandaag — ${fmtDateShort(today)}`,              headerCls: "text-red-600",   tasks: sortBucket(buckets.today)    },
    { key: "soon",     label: `Binnenkort — t/m ${fmtDateShort(in3days)}`,    headerCls: "text-amber-700", tasks: sortBucket(buckets.soon)     },
    { key: "thisWeek", label: `Deze week — t/m ${fmtDateShort(in7days)}`,     headerCls: "text-blue-700",  tasks: sortBucket(buckets.thisWeek) },
    { key: "later2w",  label: "Volgende week",                                 headerCls: "text-zinc-600",  tasks: sortBucket(buckets.later2w)  },
    { key: "later",    label: "Later",                                         headerCls: "text-zinc-600",  tasks: sortBucket(buckets.later)    },
    { key: "flexible", label: "Flexibel — geen datum",                         headerCls: "text-zinc-600",  tasks: sortBucket(buckets.flexible) },
  ].filter(g => g.tasks.length > 0);
}

// ── Agenda row ────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<ScheduleType, { icon: string; cls: string; label: string }> = {
  timed:    { icon: "📌", cls: "text-red-600",     label: "Vaste afspraak" },
  scheduled:{ icon: "📅", cls: "text-emerald-700", label: "Ingepland" },
  deadline: { icon: "⏰", cls: "text-amber-700",   label: "Deadline" },
  flexible: { icon: "○",  cls: "text-zinc-600",    label: "Flexibel" },
};

const PRIO_CLS: Record<string, string> = {
  P0: "text-red-600 bg-red-500/10 border-red-500/30",
  P1: "text-orange-700 bg-orange-500/10 border-orange-500/30",
  P2: "text-blue-700 bg-blue-500/10 border-blue-500/30",
  P3: "text-zinc-600 bg-white border-gray-200",
};

interface AgendaRowProps {
  task: MentorTask;
  onEdit: (t: MentorTask) => void;
  onComplete: (id: string) => void;
  onPark: (id: string) => void;
}

function AgendaTaskRow({ task, onEdit, onComplete, onPark }: AgendaRowProps) {
  const type = getScheduleType(task);
  const ti   = TYPE_ICON[type];
  const dl   = task.hardDeadline ?? task.deadline;

  let dateStr = "";
  if (task.plannedStart) {
    dateStr = new Date(task.plannedStart).toLocaleString("nl-NL", {
      weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam",
    });
  } else if (dl) {
    dateStr = `dl: ${fmtDateShort(dl)}`;
  }

  return (
    <div
      onClick={() => onEdit(task)}
      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100/60 cursor-pointer transition-colors border-b border-gray-200/40 last:border-b-0 group"
    >
      <span className={`text-sm shrink-0 ${ti.cls}`} title={ti.label}>{ti.icon}</span>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${PRIO_CLS[task.priority] ?? ""}`}>
        {task.priority}
      </span>
      {task.coveyQuadrant && (
        <span className="text-[9px] text-zinc-600 shrink-0">{task.coveyQuadrant}</span>
      )}
      <span className="text-xs text-zinc-800 flex-1 truncate">{task.title}</span>
      {dateStr && (
        <span className="text-[10px] text-zinc-600 font-mono shrink-0 hidden sm:inline">{dateStr}</span>
      )}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onComplete(task.id); }}
          className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-800/60 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
          title="Klaar"
        >✓</button>
        <button
          onClick={e => { e.stopPropagation(); onPark(task.id); }}
          className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-zinc-600 hover:text-amber-700 transition-colors"
          title="Parkeren"
        >⏸</button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TaskBoard({ tasks, onTasksChange }: TaskBoardProps) {
  const [search, setSearch]                         = useState("");
  const [viewMode, setViewMode]                     = useState<BoardView>("covey");
  const [editingTask, setEditingTask]               = useState<MentorTask | null>(null);
  const [showCreateModal, setShowCreateModal]       = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring]     = useState<MentorRecurringTask | null>(null);
  const [recurringTasks, setRecurringTasks]         = useState<MentorRecurringTask[]>([]);
  const [showDone, setShowDone]                     = useState(false);
  const [showRoutines, setShowRoutines]             = useState(false);
  const [draggedId, setDraggedId]                   = useState<string | null>(null);
  const [dragOverCol, setDragOverCol]               = useState<CoveyQuadrant | null>(null);
  const leaveTimers                                 = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadRecurring = useCallback(async () => {
    try {
      const res  = await fetch("/api/recurring-tasks");
      const data = await res.json() as { recurringTasks: MentorRecurringTask[] };
      setRecurringTasks(data.recurringTasks ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadRecurring(); }, [loadRecurring]);

  async function api(path: string, method = "POST", body?: unknown) {
    await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body:    body ? JSON.stringify(body) : undefined,
    });
    onTasksChange();
  }

  const handleComplete = useCallback((id: string) => api(`/api/tasks/${id}/complete`),                      [onTasksChange]);
  const handleCancel   = useCallback((id: string) => api(`/api/tasks/${id}/cancel`),                        [onTasksChange]);
  const handlePark     = useCallback((id: string) => api(`/api/tasks/${id}/park`, "POST", { reason: "" }), [onTasksChange]);
  const handleReopen   = useCallback((id: string) => api(`/api/tasks/${id}/reopen`),                        [onTasksChange]);
  const handlePriority = useCallback((id: string, priority: string) => api(`/api/tasks/${id}`, "PATCH", { priority }), [onTasksChange]);

  async function handleSaveEdit(updated: Partial<MentorTask>) {
    if (!editingTask) return;
    await api(`/api/tasks/${editingTask.id}`, "PATCH", updated);
    setEditingTask(null);
  }

  async function handleDrop(q: CoveyQuadrant) {
    if (!draggedId) return;
    const task = tasks.find(t => t.id === draggedId);
    setDraggedId(null);
    setDragOverCol(null);
    if (!task || (task.coveyQuadrant ?? "Q2") === q) return;
    await api(`/api/tasks/${draggedId}`, "PATCH", { coveyQuadrant: q });
  }

  const active = tasks.filter(t => t.status === "open" || t.status === "in_progress");
  const done   = tasks.filter(t => t.status === "done" || t.status === "cancelled");

  function filteredActive(): MentorTask[] {
    if (!search) return active;
    const s = search.toLowerCase();
    return active.filter(t =>
      t.title.toLowerCase().includes(s) ||
      (t.project ?? "").toLowerCase().includes(s) ||
      (t.tags ?? []).some(tag => tag.toLowerCase().includes(s))
    );
  }

  function colTasks(q: CoveyQuadrant): MentorTask[] {
    return sortTasks(filteredActive().filter(t => (t.coveyQuadrant ?? "Q2") === q));
  }

  const agendaGroups = viewMode === "agenda" ? getAgendaGroups(filteredActive()) : [];

  return (
    <>
      <div className="flex flex-col h-full min-h-0 bg-gray-100">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0 flex-wrap">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1 text-xs font-medium rounded border border-blue-600/40 text-blue-700 hover:bg-blue-600/10 transition-colors shrink-0"
          >
            + Nieuwe taak
          </button>
          <button
            onClick={() => { setEditingRecurring(null); setShowRecurringModal(true); }}
            className="px-3 py-1 text-xs font-medium rounded border border-gray-200 text-zinc-600 hover:border-blue-600/40 hover:text-blue-700 transition-colors shrink-0"
          >
            + Routine
          </button>
          <input
            type="text"
            placeholder="Zoeken..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[80px] px-2 py-1 text-xs bg-white text-zinc-800 border border-gray-200 rounded focus:outline-none focus:border-blue-500/60 placeholder-zinc-600"
          />
          {/* View toggle */}
          <div className="flex rounded border border-gray-200 overflow-hidden shrink-0">
            <button
              onClick={() => setViewMode("covey")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === "covey" ? "bg-gray-100 text-zinc-900" : "text-zinc-600 hover:text-zinc-700"}`}
              title="Covey kwadrant"
            >⊞</button>
            <button
              onClick={() => setViewMode("agenda")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-200 ${viewMode === "agenda" ? "bg-gray-100 text-zinc-900" : "text-zinc-600 hover:text-zinc-700"}`}
              title="Agenda / datum"
            >≡</button>
          </div>
        </div>

        {/* ── Covey view ── */}
        {viewMode === "covey" && (
          <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:h-full">
              {COLS.map((col, idx) => {
                const colTaskList = colTasks(col.key);
                const isDrop      = dragOverCol === col.key && !!draggedId;
                return (
                  <div
                    key={col.key}
                    onDragOver={e => {
                      e.preventDefault();
                      clearTimeout(leaveTimers.current[col.key]);
                      setDragOverCol(col.key);
                    }}
                    onDragLeave={() => {
                      leaveTimers.current[col.key] = setTimeout(() => setDragOverCol(null), 80);
                    }}
                    onDrop={() => handleDrop(col.key)}
                    className={`
                      flex flex-col sm:flex-1 sm:min-h-0
                      ${idx < COLS.length - 1 ? "border-b sm:border-b-0 sm:border-r border-gray-200" : ""}
                      transition-all duration-100
                      ${isDrop ? `ring-1 ring-inset ${col.dropCls}` : ""}
                    `}
                  >
                    <div className="px-3 py-2.5 border-b border-gray-200 shrink-0 bg-gray-100 sticky top-0 z-10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-sm font-bold ${col.textCls}`}>{col.label}</span>
                          <span className="text-[10px] text-zinc-600 hidden sm:inline">{col.sub}</span>
                        </div>
                        <span className="text-xs text-zinc-600 tabular-nums font-mono">{colTaskList.length}</span>
                      </div>
                    </div>
                    <div className="sm:flex-1 sm:overflow-y-auto p-2 space-y-2 min-h-[80px]">
                      {colTaskList.length === 0
                        ? <p className="text-[10px] text-zinc-700 italic text-center pt-4">Leeg</p>
                        : colTaskList.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onComplete={handleComplete}
                              onCancel={handleCancel}
                              onPark={handlePark}
                              onReopen={handleReopen}
                              onEdit={setEditingTask}
                              onUpdatePriority={handlePriority}
                              onDragStart={() => setDraggedId(task.id)}
                              onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                            />
                          ))
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Agenda view ── */}
        {viewMode === "agenda" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Legend */}
            <div className="flex items-center gap-4 px-3 py-1.5 border-b border-gray-200/50 bg-white/50 flex-wrap">
              {(Object.entries(TYPE_ICON) as [ScheduleType, typeof TYPE_ICON[ScheduleType]][]).map(([k, v]) => (
                <span key={k} className={`text-[10px] flex items-center gap-1 ${v.cls}`}>
                  <span>{v.icon}</span>
                  <span className="text-zinc-600">{v.label}</span>
                </span>
              ))}
            </div>

            {agendaGroups.length === 0 && (
              <p className="text-xs text-zinc-600 italic text-center py-8">Geen taken gevonden</p>
            )}

            {agendaGroups.map(group => (
              <div key={group.key}>
                <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${group.headerCls} bg-white/80 border-b border-gray-200 sticky top-0 z-10 flex items-center justify-between`}>
                  <span>{group.label}</span>
                  <span className="font-normal opacity-60">{group.tasks.length}</span>
                </div>
                <div>
                  {group.tasks.map(task => (
                    <AgendaTaskRow
                      key={task.id}
                      task={task}
                      onEdit={setEditingTask}
                      onComplete={handleComplete}
                      onPark={handlePark}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Routines accordion */}
        <div className="border-t border-gray-200 shrink-0">
          <button
            onClick={() => setShowRoutines(v => !v)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs text-zinc-600 hover:text-zinc-700 hover:bg-gray-100/40 transition-colors"
          >
            <span>Routines ({recurringTasks.filter(t => t.isActive).length} actief)</span>
            <span className="text-zinc-600">{showRoutines ? "▲" : "▼"}</span>
          </button>
          {showRoutines && (
            <div className="max-h-60 overflow-y-auto border-t border-gray-200">
              <RecurringTasksPanel
                templates={recurringTasks}
                onRefresh={() => { loadRecurring(); onTasksChange(); }}
                onEdit={t => { setEditingRecurring(t); setShowRecurringModal(true); }}
              />
            </div>
          )}
        </div>

        {/* Done accordion */}
        <div className="border-t border-gray-200 shrink-0">
          <button
            onClick={() => setShowDone(v => !v)}
            className="w-full px-3 py-2 flex items-center justify-between text-xs text-zinc-600 hover:text-zinc-700 hover:bg-gray-100/40 transition-colors"
          >
            <span>Gedaan ({done.length})</span>
            <span className="text-zinc-600">{showDone ? "▲" : "▼"}</span>
          </button>
          {showDone && (
            <div className="max-h-60 overflow-y-auto border-t border-gray-200 p-2 space-y-2">
              {done.length === 0
                ? <p className="text-[10px] text-zinc-700 italic p-1">Geen voltooide taken.</p>
                : done.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={handleComplete}
                      onCancel={handleCancel}
                      onPark={handlePark}
                      onReopen={handleReopen}
                      onEdit={setEditingTask}
                    />
                  ))
              }
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <TaskCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { onTasksChange(); setShowCreateModal(false); }}
        />
      )}

      <TaskEditorModal
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveEdit}
      />

      {showRecurringModal && (
        <RecurringTaskModal
          template={editingRecurring}
          onClose={() => { setShowRecurringModal(false); setEditingRecurring(null); }}
          onSaved={() => { loadRecurring(); onTasksChange(); }}
        />
      )}
    </>
  );
}
