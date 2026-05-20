"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";
import PriorityTaskInbox from "./PriorityTaskInbox";
import WeekTimeGrid from "./WeekTimeGrid";

interface GoogleEvent {
  id: string; title: string; start: string; end: string;
  allDay: boolean; source: "google_calendar"; calendarId: string;
}
interface SchedulerData {
  blocks: ScheduleBlock[];
  tasks: MentorTask[];
  googleEvents: GoogleEvent[];
  lastRun: { finishedAt: string | null; blocksCreated: number; warnings: string[] } | null;
  warnings: string[];
}

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

interface Props { onTasksChange?: () => void; }

export default function PlannerWorkspace({ onTasksChange }: Props) {
  const [data, setData] = useState<SchedulerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekBase, setWeekBase] = useState(todayISO());
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const weekDays = getWeekDays(weekBase);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheduler/blocks?from=${weekDays[0]}&to=${weekDays[6]}&google=true`);
      if (res.ok) setData(await res.json() as SchedulerData);
    } finally { setLoading(false); }
  }, [weekDays[0], weekDays[6]]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/auth/google/status").then(r => r.json()).then((j: { connected: boolean }) => setGoogleConnected(j.connected ?? false)).catch(() => {});
  }, []);
  useEffect(() => {
    pollingRef.current = setInterval(load, 20000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [load]);

  async function recalculate() {
    setRecalcLoading(true);
    try {
      await fetch("/api/scheduler/recalculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ triggeredBy: "manual", horizonDays: 28, syncToGoogle: true }) });
      await load(); onTasksChange?.();
    } finally { setRecalcLoading(false); }
  }

  async function handleDropTask(taskId: string, start: string, end: string) {
    await fetch("/api/scheduler/blocks/create-from-task", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, start, end, lock: true, syncToGoogle: true }) });
    await load(); onTasksChange?.();
  }
  async function handleMoveBlock(blockId: string, start: string, end: string) {
    await fetch(`/api/scheduler/blocks/${blockId}/move`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, end, lock: true, syncToGoogle: true }) });
    await load();
  }

  function prevWeek() { setWeekBase(w => { const d = new Date(`${w}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-7); return d.toISOString().slice(0,10); }); }
  function nextWeek() { setWeekBase(w => { const d = new Date(`${w}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+7); return d.toISOString().slice(0,10); }); }

  const warnings = data?.warnings ?? [];
  const lastRun = data?.lastRun;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <button onClick={recalculate} disabled={recalcLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors">
          {recalcLoading ? "Plannen…" : "↺ Herplan"}
        </button>

        <div className="flex items-center gap-1.5 border border-zinc-700 rounded-md overflow-hidden">
          <button onClick={prevWeek} className="px-2 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-sm">‹</button>
          <button onClick={() => setWeekBase(todayISO())} className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">Vandaag</button>
          <button onClick={nextWeek} className="px-2 py-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-sm">›</button>
        </div>

        <span className="text-xs text-zinc-500">{weekDays[0]} – {weekDays[6]}</span>

        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          {warnings.length > 0 && <span className="text-amber-400">⚠ {warnings.length} waarschuwing{warnings.length !== 1 ? "en" : ""}</span>}
          {lastRun?.finishedAt && <span>Run: {lastRun.finishedAt.slice(11,16)}</span>}
          <span className={`flex items-center gap-1 ${googleConnected ? "text-emerald-400" : "text-zinc-600"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${googleConnected ? "bg-emerald-400" : "bg-zinc-600"}`} />
            Google
          </span>
          <button onClick={() => setShowDev(v => !v)} className="text-zinc-600 hover:text-zinc-400 transition-colors">⚙</button>
        </div>
      </div>

      {/* Dev tools (collapsible) */}
      {showDev && (
        <div className="flex gap-2 px-4 py-2 bg-zinc-900/50 border-b border-zinc-800 shrink-0">
          <span className="text-[10px] text-zinc-600 self-center uppercase tracking-wider">Dev:</span>
          <button onClick={async () => { await fetch("/api/google/calendar/sync-now", { method: "POST" }); await load(); }}
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">Full sync</button>
          <button onClick={async () => { await fetch("/api/google/calendar/repair-sync", { method: "POST" }); await load(); }}
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors">Repair sync</button>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-900/40 shrink-0">
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {warnings.map((w,i) => <span key={i} className="text-[11px] text-amber-300">• {w}</span>)}
          </div>
        </div>
      )}

      {/* Main: inbox + calendar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-52 shrink-0 border-r border-zinc-800 overflow-hidden">
          <PriorityTaskInbox tasks={data?.tasks ?? []} blocks={data?.blocks ?? []} />
        </div>
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">Laden…</div>
          ) : (
            <WeekTimeGrid
              weekDays={weekDays}
              blocks={data?.blocks ?? []}
              googleEvents={data?.googleEvents ?? []}
              tasks={data?.tasks ?? []}
              onDropTask={handleDropTask}
              onMoveBlock={handleMoveBlock}
            />
          )}
        </div>
      </div>
    </div>
  );
}