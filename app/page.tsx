"use client";

import { useState, useEffect, useCallback } from "react";
import CostBadge from "@/components/CostBadge";
import MentorChat from "@/components/MentorChat";
import TaskBoard from "@/components/TaskBoard";
import PlannerWorkspace from "@/components/planner/PlannerWorkspace";
import CoveyMatrix from "@/components/CoveyMatrix";
import DailyFocus from "@/components/DailyFocus";
import UpcomingWarnings from "@/components/UpcomingWarnings";
import type { MentorTask, CoveyQuadrant, MentorAdvice } from "@/lib/mentorTypes";
import { analyzeTask } from "@/lib/mentor/taskAnalyzer";

type TabId = "planner" | "tasks" | "matrix" | "ai";

const TABS: { id: TabId; label: string }[] = [
  { id: "planner", label: "Planner" },
  { id: "tasks",   label: "Taken" },
  { id: "matrix",  label: "Matrix" },
  { id: "ai",      label: "AI Mentor" },
];

export default function Home() {
  const [tasks, setTasks] = useState<MentorTask[]>([]);
  const [advice, setAdvice] = useState<MentorAdvice | null>(null);
  const [quadrantFilter, setQuadrantFilter] = useState<CoveyQuadrant | null>(null);
  const [costRefresh, setCostRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>("planner");

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json() as { tasks: MentorTask[] };
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

  useEffect(() => { loadTasks(); }, [loadTasks]);

  function handleMentorComplete() {
    setCostRefresh(n => n + 1);
    loadTasks();
  }

  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const activeTasks = tasks.filter(t => t.status === "open" || t.status === "in_progress");
  const p0q1Tasks = activeTasks.filter(t => t.priority === "P0" || t.coveyQuadrant === "Q1");
  const topTask = p0q1Tasks.length > 0
    ? [...p0q1Tasks].sort((a, b) => {
        const da = a.hardDeadline ?? a.deadline ?? "9999";
        const db = b.hardDeadline ?? b.deadline ?? "9999";
        return da.localeCompare(db);
      })[0]
    : null;
  const topAnalysis = topTask ? analyzeTask(topTask, { todayISO }) : null;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-zinc-100 tracking-tight">AI Mentor</span>
          <span className="text-xs text-zinc-600 font-mono">v4</span>
          <nav className="flex items-center gap-0.5 ml-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <CostBadge refreshTrigger={costRefresh} />
      </header>

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {activeTab === "planner" && (
          <PlannerWorkspace onTasksChange={loadTasks} />
        )}

        {activeTab === "tasks" && (
          <TaskBoard
            tasks={tasks}
            onTasksChange={loadTasks}
            quadrantFilter={quadrantFilter}
            onClearQuadrantFilter={() => setQuadrantFilter(null)}
          />
        )}

        {activeTab === "matrix" && (
          <div className="flex flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col flex-1 p-5 gap-5 max-w-4xl mx-auto w-full">
              <DailyFocus advice={advice} topTask={topTask} topAnalysis={topAnalysis} />
              <UpcomingWarnings advice={advice} />
              <div>
                <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">Covey Matrix</p>
                <CoveyMatrix
                  tasks={tasks}
                  onFilterQuadrant={setQuadrantFilter}
                  activeFilter={quadrantFilter}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "ai" && (
          <MentorChat onComplete={handleMentorComplete} onAdvice={setAdvice} />
        )}
      </div>
    </div>
  );
}
