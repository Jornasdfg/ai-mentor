"use client";

import { useState, useCallback, useEffect } from "react";
import CostBadge from "@/components/CostBadge";
import EnableNotifications from "@/components/EnableNotifications";
import MentorChat from "@/components/MentorChat";
import TaskBoard from "@/components/TaskBoard";
import PlannerWorkspace from "@/components/planner/PlannerWorkspace";
import MissedRoutineModal, { type MissedItem } from "@/components/MissedRoutineModal";
import InstagramWeekPrompt from "@/components/InstagramWeekPrompt";
import FinanceWorkspace from "@/components/finance/FinanceWorkspace";
import WerkWorkspace from "@/components/werk/WerkWorkspace";
import type { MentorTask } from "@/lib/mentorTypes";
import { analyzeTask } from "@/lib/mentor/taskAnalyzer";
import { isRoutine } from "@/lib/mentor/taskCharacter";

type TabId = "planner" | "tasks" | "ai" | "finance" | "vanvijven" | "ledgnd";

// Directe tabs in de balk.
const NAV_TABS: { id: TabId; label: string }[] = [
  { id: "planner",  label: "Planner" },
  { id: "tasks",    label: "Taken"   },
  { id: "ai",       label: "AI Mentor" },
];

// Tools onder het ☰-menu (hier komen er meer bij).
const TOOLS: { id: TabId; label: string; emoji: string; desc: string }[] = [
  { id: "finance",   label: "Financiën", emoji: "💶", desc: "Bonnen, facturen & maandtotalen" },
  { id: "vanvijven", label: "Van Vijven (werk)", emoji: "🚚", desc: "Uren & vrachtbonnen + werkgever-link" },
  { id: "ledgnd",    label: "Ledgnd (werk)", emoji: "💡", desc: "Uren + beschrijving + werkgever-link" },
];

function IconPlanner() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="16" height="14" rx="2"/>
      <path d="M8 3v4M14 3v4M3 10h16"/>
      <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/>
      <circle cx="11" cy="15" r="1" fill="currentColor" stroke="none"/>
      <circle cx="14" cy="15" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}
function IconTasks() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6h9M9 11h9M9 16h9"/>
      <polyline points="4,5 5,6.5 7,4"/>
      <polyline points="4,10 5,11.5 7,9"/>
      <polyline points="4,15 5,16.5 7,14"/>
    </svg>
  );
}
function IconAI() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="M8 14s1-2.5 3-2.5 3 2.5 3 2.5"/>
      <circle cx="8.5" cy="9.5" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="13.5" cy="9.5" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}
function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h16M3 11h16M3 16h16"/>
    </svg>
  );
}

const TAB_ICONS: Record<"planner" | "tasks" | "ai", React.ReactNode> = {
  planner: <IconPlanner />,
  tasks:   <IconTasks />,
  ai:      <IconAI />,
};

export default function Home() {
  const [tasks, setTasks]             = useState<MentorTask[]>([]);
  const [costRefresh, setCostRefresh] = useState(0);
  const [activeTab, setActiveTab]   = useState<TabId>("planner");
  const [showTools, setShowTools]   = useState(false);
  const [missedHandled, setMissedHandled] = useState<Set<string>>(new Set());
  const [missedClosed, setMissedClosed]   = useState(false);
  const [missedBusy, setMissedBusy]       = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const res  = await fetch("/api/tasks");
      const data = await res.json() as { tasks: MentorTask[] };
      const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
      const enriched = data.tasks.map(t => {
        const analysis = analyzeTask(t, { todayISO });
        return {
          ...t,
          coveyQuadrant:    t.coveyQuadrant    ?? analysis.coveyQuadrant,
          urgencyScore:     t.urgencyScore     ?? analysis.urgencyScore,
          importanceScore:  t.importanceScore  ?? analysis.importanceScore,
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

  // ── Gemiste routines: pop-up bij openen ("gisteren niet gedaan → vandaag plannen of overslaan") ──
  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const missedItems: MissedItem[] = tasks
    .filter(t => isRoutine(t) && (t.status === "open" || t.status === "in_progress"))
    .map(t => ({
      id: t.id,
      title: t.title,
      missedDate: t.scheduleOnDate ?? t.recurrenceDate ?? t.hardDeadline ?? t.deadline ?? "",
    }))
    .filter(m => m.missedDate && m.missedDate < todayISO && !missedHandled.has(m.id));

  async function planMissedToday(id: string) {
    setMissedBusy(id);
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleOnDate: todayISO, autoSchedule: "auto", status: "open" }),
      });
      setMissedHandled(s => new Set(s).add(id));
      await loadTasks();
    } finally { setMissedBusy(null); }
  }
  async function skipMissed(id: string) {
    setMissedBusy(id);
    try {
      await fetch(`/api/tasks/${id}/cancel`, { method: "POST" });
      setMissedHandled(s => new Set(s).add(id));
      await loadTasks();
    } finally { setMissedBusy(null); }
  }

  const toolActive = activeTab === "finance" || activeTab === "vanvijven" || activeTab === "ledgnd";
  function openTool(id: TabId) { setActiveTab(id); setShowTools(false); }

  return (
    <div className="flex flex-col h-[100dvh] text-zinc-900 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-4 py-2 border-b border-gray-200/70 bg-white/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-extrabold tracking-tight bg-gradient-to-br from-accent to-accent2 bg-clip-text text-transparent shrink-0">AI Mentor</span>
          <span className="text-xs text-zinc-500 hidden sm:inline shrink-0">v4</span>
          <CostBadge refreshTrigger={costRefresh} />
          <nav className="hidden sm:flex items-center gap-0.5 ml-2">
            {NAV_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-all active:scale-95 ${
                  activeTab === tab.id
                    ? "bg-gradient-to-br from-accent to-accent2 text-white shadow-soft"
                    : "text-zinc-600 hover:text-zinc-800 hover:bg-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => setShowTools(true)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-all active:scale-95 flex items-center gap-1.5 ${
                toolActive ? "bg-gradient-to-br from-accent to-accent2 text-white shadow-soft" : "text-zinc-600 hover:text-zinc-800 hover:bg-white"
              }`}
            >
              <span className="scale-75 -ml-1"><IconMenu /></span>
              {toolActive ? (TOOLS.find(t => t.id === activeTab)?.label ?? "Meer") : "Meer"}
            </button>
          </nav>
        </div>
        <EnableNotifications />
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex flex-1 min-h-0 overflow-hidden mb-[56px] sm:mb-0">
          {activeTab === "planner" && (
            <PlannerWorkspace onTasksChange={loadTasks} />
          )}

          {activeTab === "tasks" && (
            <TaskBoard tasks={tasks} onTasksChange={loadTasks} />
          )}

          {activeTab === "ai" && (
            <MentorChat onComplete={handleMentorComplete} />
          )}

          {activeTab === "finance" && (
            <FinanceWorkspace />
          )}

          {activeTab === "vanvijven" && (
            <WerkWorkspace client="vanvijven" />
          )}

          {activeTab === "ledgnd" && (
            <WerkWorkspace client="ledgnd" />
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-sm border-t border-gray-200 flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-all active:scale-95 ${
              activeTab === tab.id ? "text-accent" : "text-zinc-500"
            }`}
          >
            {TAB_ICONS[tab.id as "planner" | "tasks" | "ai"]}
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        ))}
        <button
          onClick={() => setShowTools(true)}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-all active:scale-95 ${toolActive ? "text-accent" : "text-zinc-500"}`}
        >
          <IconMenu />
          <span className="text-[10px] font-medium">Meer</span>
        </button>
      </nav>

      {/* Tools-menu (uitklap) */}
      {showTools && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setShowTools(false)}>
          <div
            className="w-full sm:max-w-sm bg-panel rounded-t-2xl sm:rounded-2xl shadow-lift overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-800">Tools</span>
              <button onClick={() => setShowTools(false)} className="text-zinc-400 text-xl leading-none">×</button>
            </div>
            <div className="p-2">
              {TOOLS.map(t => (
                <button
                  key={t.id}
                  onClick={() => openTool(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${activeTab === t.id ? "bg-accent/10" : "hover:bg-surface"}`}
                >
                  <span className="text-2xl shrink-0">{t.emoji}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-zinc-800">{t.label}</span>
                    <span className="block text-[11px] text-zinc-500 truncate">{t.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!missedClosed && (
        <MissedRoutineModal
          items={missedItems}
          busyId={missedBusy}
          onPlanToday={planMissedToday}
          onSkip={skipMissed}
          onClose={() => setMissedClosed(true)}
        />
      )}

      <InstagramWeekPrompt />
    </div>
  );
}
