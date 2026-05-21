"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";
import PriorityTaskInbox from "./PriorityTaskInbox";
import WeekTimeGrid, { type GoogleEvent } from "./WeekTimeGrid";
import MonthView from "./MonthView";
import BlockDetailPanel from "./BlockDetailPanel";
import GoogleEventPanel from "./GoogleEventPanel";

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

interface Props { onTasksChange?: () => void; }

export default function PlannerWorkspace({ onTasksChange }: Props) {
  const [data, setData] = useState<SchedulerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekBase, setWeekBase] = useState(todayISO());
  const [monthBase, setMonthBase] = useState(todayISO().slice(0, 7) + "-01");
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlock | null>(null);
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<GoogleEvent | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const weekDays = getWeekDays(weekBase);

  const rangeFrom = viewMode === "week" ? weekDays[0] : monthBase.slice(0, 7) + "-01";
  const rangeTo = viewMode === "week"
    ? weekDays[6]
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

  useEffect(() => {
    fetch("/api/google/calendar/watch/ensure", { method: "POST" }).catch(() => {});
  }, []);

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
    await fetch(`/api/tasks/${taskId}/complete`, { method: "PATCH" });
    closeAllPanels();
    await load();
    onTasksChange?.();
  }

  async function handleRemoveBlock(blockId: string) {
    await fetch(`/api/scheduler/blocks/${blockId}`, { method: "DELETE" });
    closeAllPanels();
    await load();
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

  function handleMonthDayClick(dayISO: string) {
    setWeekBase(dayISO);
    setViewMode("week");
  }

  function prevWeek() {
    setWeekBase(w => { const d = new Date(`${w}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-7); return d.toISOString().slice(0,10); });
  }
  function nextWeek() {
    setWeekBase(w => { const d = new Date(`${w}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+7); return d.toISOString().slice(0,10); });
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

  const showPanel = liveSelectedBlock || liveSelectedGoogleEvent;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 w-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900 shrink-0 flex-wrap gap-y-1.5">
        <div className="flex items-center gap-0.5 border border-zinc-700 rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode("week")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "week" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"}`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode("month")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "month" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"}`}
          >
            Maand
          </button>
        </div>

        <div className="flex items-center gap-1.5 border border-zinc-700 rounded-md overflow-hidden">
          <button
            onClick={viewMode === "week" ? prevWeek : () => setMonthBase(mb => shiftMonth(mb, -1))}
            className="px-2 py-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-sm"
          >
            ‹
          </button>
          <button
            onClick={() => {
              if (viewMode === "week") setWeekBase(todayISO());
              else setMonthBase(todayISO().slice(0, 7) + "-01");
            }}
            className="px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Vandaag
          </button>
          <button
            onClick={viewMode === "week" ? nextWeek : () => setMonthBase(mb => shiftMonth(mb, 1))}
            className="px-2 py-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-sm"
          >
            ›
          </button>
        </div>

        <span className="text-xs text-zinc-500 min-w-[160px]">
          {viewMode === "week" ? `${weekDays[0]} – ${weekDays[6]}` : monthLabel(monthBase)}
        </span>

        <button
          onClick={recalculate}
          disabled={recalcLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
        >
          {recalcLoading ? "Plannen…" : "↺ Herplan"}
        </button>

        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          {warnings.length > 0 && (
            <span className="text-amber-400">⚠ {warnings.length} waarschuwing{warnings.length !== 1 ? "en" : ""}</span>
          )}
          {lastRun?.finishedAt && <span>Run: {lastRun.finishedAt.slice(11,16)}</span>}
          <span className={`flex items-center gap-1 ${googleConnected ? "text-emerald-400" : "text-zinc-600"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${googleConnected ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
            {googleConnected ? "Google live" : "Google uit"}
          </span>
          <button onClick={() => setShowDev(v => !v)} className="text-zinc-600 hover:text-zinc-400 transition-colors">⚙</button>
        </div>
      </div>

      {showDev && (
        <div className="flex gap-2 px-4 py-2 bg-zinc-900/50 border-b border-zinc-800 shrink-0 flex-wrap">
          <span className="text-[10px] text-zinc-600 self-center uppercase tracking-wider">Dev:</span>
          <button onClick={async () => { await fetch("/api/google/calendar/sync-now", { method: "POST" }); await load(); }}
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors">
            Full sync
          </button>
          <button onClick={async () => { await fetch("/api/google/calendar/repair-sync", { method: "POST" }); await load(); }}
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors">
            Repair sync
          </button>
          <button onClick={async () => { await fetch("/api/google/calendar/watch/ensure", { method: "POST" }); }}
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors">
            Ensure watch
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-900/40 shrink-0">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {warnings.map((w, i) => <span key={i} className="text-[11px] text-amber-300">• {w}</span>)}
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {viewMode === "week" && (
          <div className="w-48 shrink-0 border-r border-zinc-800 overflow-hidden">
            <PriorityTaskInbox tasks={data?.tasks ?? []} blocks={data?.blocks ?? []} />
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">Laden…</div>
          ) : viewMode === "week" ? (
            <WeekTimeGrid
              weekDays={weekDays}
              blocks={data?.blocks ?? []}
              googleEvents={data?.googleEvents ?? []}
              tasks={data?.tasks ?? []}
              onDropTask={handleDropTask}
              onMoveBlock={handleMoveBlock}
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
    </div>
  );
}
