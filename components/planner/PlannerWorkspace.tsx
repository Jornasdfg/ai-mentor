"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";
import PriorityTaskInbox from "./PriorityTaskInbox";
import WeekTimeGrid, { type GoogleEvent } from "./WeekTimeGrid";
import MonthView from "./MonthView";
import BlockDetailPanel from "./BlockDetailPanel";
import GoogleEventPanel from "./GoogleEventPanel";
import WorkweekSettings from "./WorkweekSettings";

interface SchedulerData {
  blocks: ScheduleBlock[];
  tasks: MentorTask[];
  googleEvents: GoogleEvent[];
  lastRun: { finishedAt: string | null; blocksCreated: number; warnings: string[] } | null;
  warnings: string[];
}

type ViewMode = "week" | "month";

function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}
function getWeekDays(base: string): string[] {
  const d = new Date(`${base}T12:00:00Z`);
  const dow = d.getUTCDay();
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon); x.setUTCDate(mon.getUTCDate() + i); return x.toISOString().slice(0,10);
  });
}
function monthLabel(base: string): string {
  const [y, m] = base.split("-").map(Number);
  const MONTHS_NL = ["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
  return `${MONTHS_NL[m - 1]} ${y}`;
}
function shiftMonth(base: string, delta: number): string {
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("nl-NL", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}
function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

interface Props { onTasksChange?: () => void; }

export default function PlannerWorkspace({ onTasksChange }: Props) {
  const [data, setData] = useState<SchedulerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekBase, setWeekBase] = useState(todayISO());
  const [monthBase, setMonthBase] = useState(todayISO().slice(0, 7) + "-01");
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [showWorkweek, setShowWorkweek] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlock | null>(null);
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<GoogleEvent | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [mobileDay, setMobileDay] = useState(todayISO());
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);

  const weekDays = getWeekDays(weekBase);
  const displayedDays = isMobile ? [mobileDay] : weekDays;

  const rangeFrom = viewMode === "week"
    ? (isMobile ? mobileDay : weekDays[0])
    : monthBase.slice(0, 7) + "-01";
  const rangeTo = viewMode === "week"
    ? (isMobile ? mobileDay : weekDays[6])
    : (() => {
        const [y, m] = monthBase.split("-").map(Number);
        return new Date(y, m, 0).toLocaleDateString("sv-SE");
      })();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheduler/blocks?from=${rangeFrom}&to=${rangeTo}&google=true`);
      if (res.ok) setData(await res.json() as SchedulerData);
    } finally { setLoading(false); }
  }, [rangeFrom, rangeTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/google/calendar/watch/ensure", { method: "POST" }).catch(() => {}); }, []);
  useEffect(() => {
    fetch("/api/auth/google/status")
      .then(r => r.json())
      .then((j: { connected: boolean }) => setGoogleConnected(j.connected ?? false))
      .catch(() => {});
  }, []);
  useEffect(() => {
    pollingRef.current = setInterval(load, 20000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [load]);

  function closeAllPanels() {
    setSelectedBlock(null);
    setSelectedGoogleEvent(null);
  }

  function prevWeek() {
    setWeekBase(w => { const d = new Date(`${w}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-7); return d.toISOString().slice(0,10); });
  }
  function nextWeek() {
    setWeekBase(w => { const d = new Date(`${w}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+7); return d.toISOString().slice(0,10); });
  }
  function prevDay() { setMobileDay(d => shiftDay(d, -1)); }
  function nextDay() { setMobileDay(d => shiftDay(d, 1)); }

  async function recalculate() {
    setRecalcLoading(true);
    try {
      await fetch("/api/scheduler/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggeredBy: "manual", horizonDays: 28, syncToGoogle: true }),
      });
      await load();
      onTasksChange?.();
    } finally { setRecalcLoading(false); }
  }

  async function handleDropTask(taskId: string, start: string, end: string) {
    await fetch("/api/scheduler/blocks/create-from-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, start, end, lock: true, syncToGoogle: true }),
    });
    await load(); onTasksChange?.();
  }

  async function handleMoveBlock(blockId: string, start: string, end: string) {
    await fetch(`/api/scheduler/blocks/${blockId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end, lock: true, syncToGoogle: true }),
    });
    await load();
  }

  async function handleCompleteTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    closeAllPanels();
    await load();
    onTasksChange?.();
  }

  async function handleRemoveBlock(blockId: string) {
    await fetch(`/api/scheduler/blocks/${blockId}`, { method: "DELETE" });
    closeAllPanels();
    await load();
  }

  async function handleConfirmBlock(blockId: string) {
    await fetch(`/api/scheduler/blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: true, source: "manual_plan", syncToGoogle: true }),
    });
    await load();
    onTasksChange?.();
  }

  async function handleUpdateTask(taskId: string, updates: Record<string, unknown>) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await load();
    onTasksChange?.();
  }

  async function handleSyncBlock(taskId: string) {
    await fetch("/api/calendar/sync-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, mode: "direct" }),
    });
    await load();
  }

  async function handleImportGoogleEvent() {
    if (!selectedGoogleEvent) return;
    await fetch("/api/calendar/import-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendarId: selectedGoogleEvent.calendarId,
        eventId: selectedGoogleEvent.id,
        title: selectedGoogleEvent.title,
        start: selectedGoogleEvent.start,
        end: selectedGoogleEvent.end,
        htmlLink: selectedGoogleEvent.htmlLink,
        description: selectedGoogleEvent.description,
      }),
    });
    closeAllPanels();
    await load();
    onTasksChange?.();
  }

  async function handleCreateTask(title: string, start: string, end: string) {
    const durationMins = Math.max(15, Math.round(
      (new Date(`2000-01-01T${end.slice(11)}`).getTime() - new Date(`2000-01-01T${start.slice(11)}`).getTime()) / 60000
    ));
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        priority: "P2",
        estimatedMinutes: durationMins,
        autoSchedule: "off",
        plannedStart: start,
        plannedEnd: end,
        plannedMinutes: durationMins,
      }),
    });
    if (!res.ok) return;
    const { task } = await res.json() as { task: { id: string } };
    await fetch("/api/scheduler/blocks/create-from-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, start, end, lock: true, syncToGoogle: true }),
    });
    await load();
    onTasksChange?.();
  }

  function handleMonthDayClick(dayISO: string) {
    setMobileDay(dayISO);
    setWeekBase(dayISO);
    setViewMode("week");
  }

  const warnings = data?.warnings ?? [];
  const lastRun = data?.lastRun;
  const selectedTask = selectedBlock ? data?.tasks.find(t => t.id === selectedBlock.taskId) : undefined;
  const liveSelectedBlock = selectedBlock
    ? (data?.blocks.find(b => b.id === selectedBlock.id) ?? selectedBlock)
    : null;
  const liveSelectedGoogleEvent = selectedGoogleEvent
    ? (data?.googleEvents.find(e => e.id === selectedGoogleEvent.id) ?? selectedGoogleEvent)
    : null;

  return (
    <div className="flex flex-col h-full bg-gray-100 text-zinc-900 w-full">

      {/* ── Desktop toolbar ── */}
      <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0 flex-wrap gap-y-1.5">
        <div className="flex items-center gap-0.5 border border-gray-200 rounded-md overflow-hidden">
          <button onClick={() => setViewMode("week")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "week" ? "bg-blue-600 text-white" : "text-zinc-600 hover:text-zinc-800 hover:bg-gray-100"}`}>
            Week
          </button>
          <button onClick={() => setViewMode("month")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "month" ? "bg-blue-600 text-white" : "text-zinc-600 hover:text-zinc-800 hover:bg-gray-100"}`}>
            Maand
          </button>
        </div>

        <div className="flex items-center gap-1.5 border border-gray-200 rounded-md overflow-hidden">
          <button onClick={viewMode === "week" ? prevWeek : () => setMonthBase(mb => shiftMonth(mb, -1))}
            className="px-2 py-1.5 text-zinc-600 hover:text-zinc-800 hover:bg-gray-100 transition-colors text-sm">‹</button>
          <button onClick={() => { if (viewMode === "week") setWeekBase(todayISO()); else setMonthBase(todayISO().slice(0, 7) + "-01"); }}
            className="px-2 py-1.5 text-xs text-zinc-600 hover:text-zinc-800 hover:bg-gray-100 transition-colors">Vandaag</button>
          <button onClick={viewMode === "week" ? nextWeek : () => setMonthBase(mb => shiftMonth(mb, 1))}
            className="px-2 py-1.5 text-zinc-600 hover:text-zinc-800 hover:bg-gray-100 transition-colors text-sm">›</button>
        </div>

        <span className="text-xs text-zinc-600 min-w-[160px]">
          {viewMode === "week" ? `${weekDays[0]} – ${weekDays[6]}` : monthLabel(monthBase)}
        </span>

        <button onClick={recalculate} disabled={recalcLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
          {recalcLoading ? "Plannen…" : "↺ Herplan"}
        </button>

        <button onClick={() => setShowWorkweek(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-zinc-700 hover:bg-gray-100 text-xs font-medium transition-colors">
          🗓 Werkweek
        </button>

        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-600">
          {warnings.length > 0 && <span className="text-amber-700">⚠ {warnings.length}</span>}
          {lastRun?.finishedAt && <span>Run: {lastRun.finishedAt.slice(11,16)}</span>}
          <span className={`flex items-center gap-1 ${googleConnected ? "text-emerald-700" : "text-zinc-600"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${googleConnected ? "bg-emerald-400 animate-pulse" : "bg-gray-400"}`} />
            {googleConnected ? "Google live" : "Google uit"}
          </span>
          <button onClick={() => setShowDev(v => !v)} className="text-zinc-600 hover:text-zinc-600 transition-colors">⚙</button>
        </div>
      </div>

      {/* ── Mobile toolbar ── */}
      <div className="sm:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
        {viewMode === "week" ? (
          <>
            <button onClick={prevDay}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-zinc-700 text-lg active:bg-gray-100">‹</button>
            <button
              onClick={() => { setMobileDay(todayISO()); setWeekBase(todayISO()); }}
              className="flex-1 text-center text-sm font-medium text-zinc-800 truncate">
              {mobileDay === todayISO() ? "Vandaag" : dayLabel(mobileDay)}
            </button>
            <button onClick={nextDay}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-zinc-700 text-lg active:bg-gray-100">›</button>
          </>
        ) : (
          <>
            <button onClick={() => setMonthBase(mb => shiftMonth(mb, -1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-zinc-700 text-lg active:bg-gray-100">‹</button>
            <span className="flex-1 text-center text-sm font-medium text-zinc-800">{monthLabel(monthBase)}</span>
            <button onClick={() => setMonthBase(mb => shiftMonth(mb, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-zinc-700 text-lg active:bg-gray-100">›</button>
          </>
        )}
        <div className="flex items-center gap-1 ml-1">
          <button onClick={() => setViewMode(v => v === "week" ? "month" : "week")}
            className="px-2.5 py-1.5 rounded-lg bg-white text-zinc-600 text-[11px] font-medium active:bg-gray-100">
            {viewMode === "week" ? "Maand" : "Week"}
          </button>
          <button onClick={recalculate} disabled={recalcLoading}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-50 active:bg-blue-500">
            <span className="text-base">{recalcLoading ? "…" : "↺"}</span>
          </button>
          <button onClick={() => setShowWorkweek(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-zinc-700 active:bg-gray-100">🗓</button>
        </div>
      </div>

      {showDev && (
        <div className="hidden sm:flex gap-2 px-4 py-2 bg-white/50 border-b border-gray-200 shrink-0 flex-wrap">
          <span className="text-[10px] text-zinc-600 self-center uppercase tracking-wider">Dev:</span>
          <button onClick={async () => { await fetch("/api/google/calendar/sync-now", { method: "POST" }); await load(); }}
            className="text-[11px] px-2 py-1 rounded border border-gray-200 text-zinc-600 hover:text-zinc-800 transition-colors">Full sync</button>
          <button onClick={async () => { await fetch("/api/google/calendar/repair-sync", { method: "POST" }); await load(); }}
            className="text-[11px] px-2 py-1 rounded border border-gray-200 text-zinc-600 hover:text-zinc-800 transition-colors">Repair sync</button>
          <button onClick={async () => { await fetch("/api/google/calendar/watch/ensure", { method: "POST" }); }}
            className="text-[11px] px-2 py-1 rounded border border-gray-200 text-zinc-600 hover:text-zinc-800 transition-colors">Ensure watch</button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-900/40 shrink-0">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {warnings.map((w, i) => <span key={i} className="text-[11px] text-amber-700">• {w}</span>)}
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {viewMode === "week" && (
          <div className="hidden sm:block w-48 shrink-0 border-r border-gray-200 overflow-hidden">
            <PriorityTaskInbox tasks={data?.tasks ?? []} blocks={data?.blocks ?? []} />
          </div>
        )}

        <div className="flex-1 overflow-hidden min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">Laden…</div>
          ) : viewMode === "week" ? (
            <WeekTimeGrid
              weekDays={displayedDays}
              blocks={data?.blocks ?? []}
              googleEvents={data?.googleEvents ?? []}
              tasks={data?.tasks ?? []}
              onDropTask={handleDropTask}
              onMoveBlock={handleMoveBlock}
              onCreateTask={handleCreateTask}
              onConfirmBlock={handleConfirmBlock}
              onClickBlock={(block, task) => {
                setSelectedGoogleEvent(null);
                setSelectedBlock(block);
                void task;
              }}
              onClickGoogleEvent={(ev) => {
                setSelectedBlock(null);
                setSelectedGoogleEvent(ev);
              }}
            />
          ) : (
            <MonthView
              monthBase={monthBase}
              blocks={data?.blocks ?? []}
              googleEvents={data?.googleEvents ?? []}
              tasks={data?.tasks ?? []}
              onDayClick={handleMonthDayClick}
            />
          )}
        </div>

        {liveSelectedBlock && (
          <BlockDetailPanel
            block={liveSelectedBlock}
            task={selectedTask}
            onClose={closeAllPanels}
            onComplete={handleCompleteTask}
            onRemove={handleRemoveBlock}
            onSync={handleSyncBlock}
            onUpdateTask={handleUpdateTask}
          />
        )}

        {liveSelectedGoogleEvent && (
          <GoogleEventPanel
            event={liveSelectedGoogleEvent}
            onClose={closeAllPanels}
            onImportAsTask={handleImportGoogleEvent}
          />
        )}
      </div>

      {showWorkweek && (
        <WorkweekSettings
          onClose={() => setShowWorkweek(false)}
          onSaved={async () => { await load(); onTasksChange?.(); }}
        />
      )}
    </div>
  );
}
