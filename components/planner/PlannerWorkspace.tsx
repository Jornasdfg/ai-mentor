"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import type { MentorTask, ScheduleBlock } from "@/lib/mentorTypes";
import SchedulerToolbar from "./SchedulerToolbar";
import PriorityTaskInbox from "./PriorityTaskInbox";
import WeekTimeGrid from "./WeekTimeGrid";
import ScheduleWarningsPanel from "./ScheduleWarningsPanel";

interface GoogleEvent {
  id: string; title: string; start: string; end: string; allDay: boolean;
  source: "google_calendar"; calendarId: string;
}

interface SchedulerData {
  blocks: ScheduleBlock[];
  tasks: MentorTask[];
  googleEvents: GoogleEvent[];
  lastRun: { id: string; finishedAt: string | null; blocksCreated: number; warnings: string[] } | null;
  warnings: string[];
}

function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function getWeekDays(baseISO: string): string[] {
  const base = new Date(`${baseISO}T12:00:00Z`);
  const dow = base.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + diffToMon);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

interface Props {
  onTasksChange?: () => void;
}

export default function PlannerWorkspace({ onTasksChange }: Props) {
  const [data, setData] = useState<SchedulerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekBase, setWeekBase] = useState(todayISO());
  const [draggingTask, setDraggingTask] = useState<MentorTask | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const weekDays = getWeekDays(weekBase);
  const fromISO = weekDays[0];
  const toISO = weekDays[6];

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheduler/blocks?from=${fromISO}&to=${toISO}&google=true`);
      if (!res.ok) throw new Error("Laden mislukt");
      const json = await res.json() as SchedulerData;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout");
    } finally {
      setLoading(false);
    }
  }, [fromISO, toISO]);

  const loadGoogleStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/google/status");
      const json = await res.json() as { connected: boolean };
      setGoogleConnected(json.connected ?? false);
    } catch {}
  }, []);

  useEffect(() => {
    loadData();
    loadGoogleStatus();
  }, [loadData, loadGoogleStatus]);

  // Polling every 20 seconds
  useEffect(() => {
    pollingRef.current = setInterval(() => { loadData(); }, 20000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [loadData]);

  async function handleRecalculate() {
    await fetch("/api/scheduler/recalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggeredBy: "manual", horizonDays: 28, syncToGoogle: true }),
    });
    await loadData();
    onTasksChange?.();
  }

  async function handleDropTask(taskId: string, start: string, end: string) {
    await fetch("/api/scheduler/blocks/create-from-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, start, end, lock: true, syncToGoogle: true }),
    });
    setDraggingTask(null);
    await loadData();
    onTasksChange?.();
  }

  async function handleMoveBlock(blockId: string, start: string, end: string) {
    await fetch(`/api/scheduler/blocks/${blockId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end, lock: true, syncToGoogle: true }),
    });
    await loadData();
  }

  async function handleFullSync() {
    await fetch("/api/google/calendar/sync-now", { method: "POST" });
    await loadData();
  }

  async function handleRepairSync() {
    await fetch("/api/google/calendar/repair-sync", { method: "POST" });
    await loadData();
  }

  function prevWeek() { setWeekBase(w => { const d = new Date(`${w}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); }); }
  function nextWeek() { setWeekBase(w => { const d = new Date(`${w}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10); }); }
  function thisWeek() { setWeekBase(todayISO()); }

  if (loading) return <div className="flex-1 flex items-center justify-center text-muted font-mono text-sm">Plannen laden…</div>;
  if (error) return <div className="flex-1 flex items-center justify-center text-danger font-mono text-sm">{error}</div>;
  if (!data) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <SchedulerToolbar
        lastRunAt={data.lastRun?.finishedAt ?? null}
        blocksCount={data.blocks.length}
        warningsCount={data.warnings.length}
        googleConnected={googleConnected}
        onRecalculate={handleRecalculate}
        onFullSync={handleFullSync}
        onRepairSync={handleRepairSync}
      />

      <ScheduleWarningsPanel warnings={data.warnings} lastRunAt={data.lastRun?.finishedAt ?? null} />

      {/* Week navigation */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <button onClick={prevWeek} className="text-xs font-mono text-muted hover:text-gray-200 px-1">◀</button>
        <button onClick={thisWeek} className="text-xs font-mono text-muted hover:text-accent px-1">Vandaag</button>
        <button onClick={nextWeek} className="text-xs font-mono text-muted hover:text-gray-200 px-1">▶</button>
        <span className="text-xs font-mono text-muted">
          {weekDays[0]} – {weekDays[6]}
        </span>
      </div>

      {/* Main layout: inbox left + grid right */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Inbox */}
        <div className="w-56 shrink-0 border-r border-border overflow-y-auto">
          <PriorityTaskInbox
            tasks={data.tasks}
            blocks={data.blocks}
            onDragStart={setDraggingTask}
          />
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-hidden">
          <WeekTimeGrid
            weekDays={weekDays}
            blocks={data.blocks}
            googleEvents={data.googleEvents}
            tasks={data.tasks}
            draggingTask={draggingTask}
            onDropTask={handleDropTask}
            onMoveBlock={handleMoveBlock}
          />
        </div>
      </div>
    </div>
  );
}