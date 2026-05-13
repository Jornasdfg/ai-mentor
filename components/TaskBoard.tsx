"use client";

import { useState, useCallback, useEffect } from "react";
import type { MentorTask, CoveyQuadrant, MentorRecurringTask } from "@/lib/mentorTypes";
import TaskCard from "./TaskCard";
import TaskEditorModal from "./TaskEditorModal";
import TaskCreateModal from "./TaskCreateModal";
import RecurringTaskModal from "./RecurringTaskModal";
import RecurringTasksPanel from "./RecurringTasksPanel";

interface TaskBoardProps {
  tasks: MentorTask[];
  onTasksChange: () => void;
  quadrantFilter: CoveyQuadrant | null;
  onClearQuadrantFilter: () => void;
}

type TabKey = "open" | "today" | "parked" | "done" | "routines";

const TABS: { key: TabKey; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "today", label: "Vandaag" },
  { key: "parked", label: "Geparkeerd" },
  { key: "done", label: "Gedaan" },
  { key: "routines", label: "Routines" },
];

function getTodayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

export default function TaskBoard({ tasks, onTasksChange, quadrantFilter, onClearQuadrantFilter }: TaskBoardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("open");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [editingTask, setEditingTask] = useState<MentorTask | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<MentorRecurringTask | null>(null);
  const [recurringTasks, setRecurringTasks] = useState<MentorRecurringTask[]>([]);

  const loadRecurring = useCallback(async () => {
    try {
      const res = await fetch("/api/recurring-tasks");
      const data = await res.json() as { recurringTasks: MentorRecurringTask[] };
      setRecurringTasks(data.recurringTasks ?? []);
    } catch {
      // silently ignore on error
    }
  }, []);

  useEffect(() => {
    loadRecurring();
  }, [loadRecurring]);

  const projects = [...new Set(tasks.map(t => t.project).filter(Boolean) as string[])].sort();

  function filterTasks(tab: TabKey): MentorTask[] {
    if (tab === "routines") return [];

    let filtered = tasks;

    if (tab === "open") filtered = filtered.filter(t => t.status === "open" || t.status === "in_progress");
    else if (tab === "today") filtered = filtered.filter(t => (t.status === "open" || t.status === "in_progress") && t.coveyQuadrant === "Q1");
    else if (tab === "parked") filtered = filtered.filter(t => t.status === "parked");
    else if (tab === "done") filtered = filtered.filter(t => t.status === "done" || t.status === "cancelled");

    if (quadrantFilter) filtered = filtered.filter(t => t.coveyQuadrant === quadrantFilter);
    if (projectFilter) filtered = filtered.filter(t => t.project === projectFilter);

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.project ?? "").toLowerCase().includes(q) ||
        (t.tags ?? []).some(tag => tag.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => {
      const pOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
      const pDiff = (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
      if (pDiff !== 0) return pDiff;
      const da = a.hardDeadline ?? a.deadline ?? "9999";
      const db = b.hardDeadline ?? b.deadline ?? "9999";
      return da.localeCompare(db);
    });

    return filtered;
  }

  async function doTaskAction(path: string, method = "POST", body?: unknown) {
    await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    onTasksChange();
  }

  const handleComplete = useCallback((id: string) => doTaskAction(`/api/tasks/${id}/complete`), [onTasksChange]);
  const handleCancel = useCallback((id: string) => doTaskAction(`/api/tasks/${id}/cancel`), [onTasksChange]);
  const handlePark = useCallback((id: string) => doTaskAction(`/api/tasks/${id}/park`, "POST", { reason: "" }), [onTasksChange]);
  const handleReopen = useCallback((id: string) => doTaskAction(`/api/tasks/${id}/reopen`), [onTasksChange]);

  async function handleSaveEdit(updated: Partial<MentorTask>) {
    if (!editingTask) return;
    await doTaskAction(`/api/tasks/${editingTask.id}`, "PATCH", updated);
    setEditingTask(null);
  }

  function handleRecurringSaved() {
    loadRecurring();
    onTasksChange(); // triggers GET /api/tasks which materializes new instances
  }

  function handleOpenRecurringEdit(template: MentorRecurringTask) {
    setEditingRecurring(template);
    setShowRecurringModal(true);
  }

  const filtered = filterTasks(activeTab);

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* Action buttons */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-panel shrink-0">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1 text-xs font-mono rounded border border-accent/50 text-accent hover:bg-accent/10 transition-colors"
          >
            + Nieuwe taak
          </button>
          <button
            onClick={() => { setEditingRecurring(null); setShowRecurringModal(true); }}
            className="px-3 py-1 text-xs font-mono rounded border border-border text-muted hover:border-accent/50 hover:text-accent transition-colors"
          >
            + Repeterende taak
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-0 border-b border-border bg-panel shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-mono rounded-t transition-colors ${
                activeTab === tab.key
                  ? "text-accent border-b-2 border-accent"
                  : "text-muted hover:text-gray-200"
              }`}
            >
              {tab.label}
              {tab.key !== "routines" && (
                <span className="ml-1 text-muted">({filterTasks(tab.key).length})</span>
              )}
              {tab.key === "routines" && (
                <span className="ml-1 text-muted">({recurringTasks.filter(t => t.isActive).length})</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "routines" ? (
          <RecurringTasksPanel
            templates={recurringTasks}
            onRefresh={() => { loadRecurring(); onTasksChange(); }}
            onEdit={handleOpenRecurringEdit}
          />
        ) : (
          <>
            {/* Filters */}
            <div className="flex gap-2 px-3 py-2 border-b border-border bg-panel shrink-0">
              <input
                type="text"
                placeholder="Zoeken..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 px-2 py-1 text-xs font-mono bg-surface text-gray-200 border border-border rounded focus:outline-none focus:border-accent/60 placeholder-muted"
              />
              <select
                value={projectFilter}
                onChange={e => setProjectFilter(e.target.value)}
                className="px-2 py-1 text-xs font-mono bg-surface text-gray-200 border border-border rounded focus:outline-none focus:border-accent/60"
              >
                <option value="">Alle projecten</option>
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {quadrantFilter && (
                <button
                  onClick={onClearQuadrantFilter}
                  className="px-2 py-1 text-xs font-mono rounded border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
                >
                  {quadrantFilter} x
                </button>
              )}
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted font-mono italic p-2">Geen taken gevonden.</p>
              ) : (
                filtered.map(task => (
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
              )}
            </div>
          </>
        )}
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
          onSaved={handleRecurringSaved}
        />
      )}
    </>
  );
}
