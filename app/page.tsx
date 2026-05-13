"use client";

import { useState, useEffect, useCallback } from "react";
import CostBadge from "@/components/CostBadge";
import MentorChat from "@/components/MentorChat";
import TaskBoard from "@/components/TaskBoard";
import PlannerCalendar from "@/components/PlannerCalendar";
import CoveyMatrix from "@/components/CoveyMatrix";
import DailyFocus from "@/components/DailyFocus";
import UpcomingWarnings from "@/components/UpcomingWarnings";
import type { MentorTask, CoveyQuadrant, MentorAdvice } from "@/lib/mentorTypes";
import { analyzeTask } from "@/lib/mentor/taskAnalyzer";

export default function Home() {
  const [tasks, setTasks] = useState<MentorTask[]>([]);
  const [advice, setAdvice] = useState<MentorAdvice | null>(null);
  const [quadrantFilter, setQuadrantFilter] = useState<CoveyQuadrant | null>(null);
  const [costRefresh, setCostRefresh] = useState(0);
  const [mainView, setMainView] = useState<"tasks" | "calendar">("tasks");

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json() as { tasks: MentorTask[] };
      // Enrich with client-side analysis
      const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
      const enriched = data.tasks.map(t => {
        const analysis = analyzeTask(t, { todayISO });
        return {
          ...t,
          coveyQuadrant: t.coveyQuadrant ?? analysis.coveyQuadrant,
          urgencyScore: t.urgencyScore ?? analysis.urgencyScore,
          importanceScore: t.importanceScore ?? analysis.importanceScore,
          deadlinePressure: t.deadlinePressure ?? analysis.deadlinePressure,
        };
      });
      setTasks(enriched);
    } catch (err) {
      console.error("Laden taken mislukt", err);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  function handleMentorComplete() {
    setCostRefresh(n => n + 1);
    loadTasks();
  }

  // Compute top task for DailyFocus
  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const activeTasks = tasks.filter(t => t.status === "open" || t.status === "in_progress");
  const p0q1Tasks = activeTasks.filter(t => t.priority === "P0" || t.coveyQuadrant === "Q1");
  const topTask = p0q1Tasks.length > 0
    ? p0q1Tasks.sort((a, b) => {
        const da = a.hardDeadline ?? a.deadline ?? "9999";
        const db = b.hardDeadline ?? b.deadline ?? "9999";
        return da.localeCompare(db);
      })[0]
    : null;
  const topAnalysis = topTask ? analyzeTask(topTask, { todayISO }) : null;

  return (
    <div className="flex flex-col h-screen bg-surface text-gray-200 overflow-hidden">
      {/* Topbar */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-panel shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-semibold text-gray-100">AI Mentor</span>
          <span className="text-xs text-muted font-mono">v3</span>
        </div>
        <div className="flex items-center gap-4">
          <CostBadge refreshTrigger={costRefresh} />
          <span className="text-xs text-muted font-mono hidden sm:block">Ctrl+Enter sturen</span>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: Focus + Matrix */}
        <div className="flex flex-col w-[340px] shrink-0 border-r border-border bg-surface overflow-y-auto p-3 space-y-3">
          <DailyFocus advice={advice} topTask={topTask} topAnalysis={topAnalysis} />
          <UpcomingWarnings advice={advice} />
          <div>
            <p className="text-xs font-mono text-muted uppercase tracking-wider mb-2">Covey Matrix</p>
            <CoveyMatrix
              tasks={tasks}
              onFilterQuadrant={setQuadrantFilter}
              activeFilter={quadrantFilter}
            />
          </div>
        </div>

        {/* Right panel: TaskBoard + Chat */}
        <div className="flex flex-1 min-w-0 min-h-0">
          {/* Middle panel: Tasks or Calendar */}
          <div className="flex flex-col flex-1 min-w-0 border-r border-border">
            <div className="shrink-0 px-4 py-2 border-b border-border bg-panel flex items-center justify-between">
              <span className="text-xs font-mono text-muted">
                {mainView === "tasks" ? "Taken" : "Kalender"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMainView("tasks")}
                  className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                    mainView === "tasks"
                      ? "border-accent/50 text-accent bg-accent/10"
                      : "border-border text-muted hover:text-gray-200"
                  }`}
                >
                  Taken
                </button>
                <button
                  onClick={() => setMainView("calendar")}
                  className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                    mainView === "calendar"
                      ? "border-accent/50 text-accent bg-accent/10"
                      : "border-border text-muted hover:text-gray-200"
                  }`}
                >
                  Kalender
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {mainView === "tasks" ? (
                <TaskBoard
                  tasks={tasks}
                  onTasksChange={loadTasks}
                  quadrantFilter={quadrantFilter}
                  onClearQuadrantFilter={() => setQuadrantFilter(null)}
                />
              ) : (
                <PlannerCalendar
                  tasks={tasks}
                  onTasksChange={loadTasks}
                />
              )}
            </div>
          </div>

          {/* Chat panel */}
          <div className="flex flex-col w-[340px] shrink-0 min-h-0">
            <MentorChat onComplete={handleMentorComplete} onAdvice={setAdvice} />
          </div>
        </div>
      </div>
    </div>
  );
}
