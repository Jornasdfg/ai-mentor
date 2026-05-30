"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEventView, MentorTask } from "@/lib/mentorTypes";

interface PlannerCalendarProps {
  tasks: MentorTask[];
  onTasksChange: () => void;
}

interface GoogleStatus {
  provider: string;
  googleEnabled: boolean;
  connected: boolean;
  calendarId?: string | null;
}

interface SyncLogItem {
  id: string;
  type: string;
  calendarId: string;
  message: string;
  createdAt: string;
}

interface WatchStatusData {
  connected: boolean;
  activeChannels: Array<{ id: string; calendarId: string; expiration: number; webhookUrl: string }>;
  syncState: Record<string, {
    calendarId: string;
    nextSyncToken?: string | null;
    lastFullSyncAt: string | null;
    lastIncrementalSyncAt: string | null;
    lastError: string | null;
  }>;
  recentLog: SyncLogItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekDays(baseISO: string): string[] {
  const base = new Date(`${baseISO}T12:00:00`);
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateISO(d);
  });
}

function labelDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("nl-NL", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam",
  });
}

function labelTime(iso: string): string {
  if (!iso.includes("T")) return "";
  return iso.slice(11, 16);
}

function defaultEnd(start: string, minutes = 30): string {
  const d = new Date(start);
  d.setMinutes(d.getMinutes() + minutes);
  return localDateISO(d) + "T" +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":00";
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      timeZone: "Europe/Amsterdam",
    });
  } catch { return iso.slice(0, 16); }
}

function getPrimarySync(watchStatus: WatchStatusData | null) {
  if (!watchStatus?.syncState) return null;
  return watchStatus.syncState["primary"] ??
    watchStatus.syncState["primary@group.calendar.google.com"] ??
    Object.values(watchStatus.syncState)[0] ??
    null;
}

const LOG_TYPE_COLOR: Record<string, string> = {
  full: "text-accent",
  incremental: "text-success",
  webhook: "text-warning",
  watch_start: "text-accent",
  watch_stop: "text-muted",
  watch_renew: "text-success",
  ensure: "text-muted",
  repair: "text-warning",
  error: "text-danger",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlannerCalendar({ tasks, onTasksChange }: PlannerCalendarProps) {
  const [baseDate, setBaseDate] = useState(todayISO());
  const [includeGoogle, setIncludeGoogle] = useState(false);
  const [events, setEvents] = useState<CalendarEventView[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Quick plan
  const [planningTaskId, setPlanningTaskId] = useState("");
  const [planningDate, setPlanningDate] = useState(todayISO());
  const [planningTime, setPlanningTime] = useState("09:00");
  const [planningMinutes, setPlanningMinutes] = useState(30);
  const [autoSync, setAutoSync] = useState(false);
  const [useOutbox, setUseOutbox] = useState(false);

  // Sync state
  const [loadingSync, setLoadingSync] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [watchStatus, setWatchStatus] = useState<WatchStatusData | null>(null);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [loadingWatch, setLoadingWatch] = useState(false);
  const [loadingFullSync, setLoadingFullSync] = useState(false);
  const [loadingIncrSync, setLoadingIncrSync] = useState(false);
  const [loadingRepairSync, setLoadingRepairSync] = useState(false);

  // Polling: track last incremental sync timestamp via ref (no re-render on change)
  const lastIncrSyncRef = useRef<string | null>(null);

  const weekDays = useMemo(() => getWeekDays(baseDate), [baseDate]);

  const unscheduledTasks = useMemo(
    () => tasks.filter(t => t.status !== "done" && t.status !== "cancelled" && !t.plannedStart).slice(0, 30),
    [tasks]
  );

  // ─── Data loading ────────────────────────────────────────────────────────────

  async function loadWatchStatus(): Promise<WatchStatusData | null> {
    try {
      const res = await fetch("/api/google/calendar/watch/status");
      if (!res.ok) return null;
      const data = await res.json() as WatchStatusData;
      setWatchStatus(data);
      return data;
    } catch { return null; }
  }

  async function loadPlanner() {
    setError(null);
    const from = weekDays[0];
    const to = weekDays[6];
    try {
      const res = await fetch(`/api/planner?from=${from}&to=${to}&google=${includeGoogle ? "1" : "0"}`);
      const data = await res.json() as { events?: CalendarEventView[]; googleEventsError?: string | null; error?: string };
      setEvents(data.events ?? []);
      if (data.googleEventsError) setError(data.googleEventsError);
      if (data.error) setError(data.error);
    } catch {
      setError("Planner laden mislukt");
    }
  }

  // Fetch on mount
  useEffect(() => {
    fetch("/api/auth/google/status")
      .then(r => r.json()).then(d => setGoogleStatus(d as GoogleStatus)).catch(() => {});
    loadWatchStatus().then(data => {
      if (data) {
        lastIncrSyncRef.current = getPrimarySync(data)?.lastIncrementalSyncAt ?? null;
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload planner when week or google toggle changes
  useEffect(() => {
    loadPlanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDays.join(","), includeGoogle, tasks.length]);

  // FASE 9: Poll watch/status every 30s; reload planner if incremental sync happened
  useEffect(() => {
    if (!googleStatus?.connected) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/google/calendar/watch/status");
        if (!res.ok) return;
        const data = await res.json() as WatchStatusData;
        const newIncrSync = getPrimarySync(data)?.lastIncrementalSyncAt ?? null;

        if (newIncrSync && lastIncrSyncRef.current && newIncrSync !== lastIncrSyncRef.current) {
          lastIncrSyncRef.current = newIncrSync;
          loadPlanner();
          onTasksChange();
        } else if (newIncrSync && !lastIncrSyncRef.current) {
          lastIncrSyncRef.current = newIncrSync;
        }
        setWatchStatus(data);
      } catch { /* ignore */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [googleStatus?.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function planTask() {
    if (!planningTaskId) return;
    const start = `${planningDate}T${planningTime}:00`;
    const end = defaultEnd(start, planningMinutes);

    const schedRes = await fetch(`/api/tasks/${planningTaskId}/schedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannedStart: start, plannedEnd: end, calendarSyncMode: autoSync ? "auto" : "manual" }),
    });

    if (autoSync && schedRes.ok) {
      await fetch("/api/calendar/sync-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: planningTaskId, mode: useOutbox ? "outbox" : "direct" }),
      }).catch(() => {});
    }

    setPlanningTaskId("");
    onTasksChange();
  }

  async function syncTask(taskId: string) {
    setLoadingSync(taskId);
    setError(null);
    try {
      const res = await fetch("/api/calendar/sync-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, mode: useOutbox ? "outbox" : "direct" }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Sync mislukt"); return; }
      onTasksChange();
      await loadPlanner();
    } finally {
      setLoadingSync(null);
    }
  }

  async function importEvent(event: CalendarEventView) {
    const res = await fetch("/api/calendar/import-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calendarId: event.calendarId, eventId: event.id,
        title: event.title, start: event.start, end: event.end,
        htmlLink: event.htmlLink, description: event.description,
      }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) { setError(data.error ?? "Import mislukt"); return; }
    onTasksChange();
  }

  async function handleStartWatch() {
    setLoadingWatch(true);
    setError(null);
    try {
      const res = await fetch("/api/google/calendar/watch/start", { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok) setError(data.error ?? "Watch starten mislukt");
      await loadWatchStatus();
    } catch { setError("Watch starten mislukt"); }
    finally { setLoadingWatch(false); }
  }

  async function handleSyncNow(mode: "full" | "incremental") {
    setError(null);
    if (mode === "full") setLoadingFullSync(true);
    else setLoadingIncrSync(true);
    try {
      const res = await fetch("/api/google/calendar/sync-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) setError(data.error ?? "Sync mislukt");
      await Promise.all([loadWatchStatus(), loadPlanner()]);
      onTasksChange();
    } catch { setError("Sync mislukt"); }
    finally { setLoadingFullSync(false); setLoadingIncrSync(false); }
  }

  async function handleRepairSync() {
    setLoadingRepairSync(true);
    setError(null);
    try {
      const res = await fetch("/api/google/calendar/repair-sync", { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok) setError(data.error ?? "Repair sync mislukt");
      await Promise.all([loadWatchStatus(), loadPlanner()]);
      onTasksChange();
    } catch { setError("Repair sync mislukt"); }
    finally { setLoadingRepairSync(false); }
  }

  function shiftWeek(days: number) {
    const d = new Date(`${baseDate}T12:00:00`);
    d.setDate(d.getDate() + days);
    setBaseDate(localDateISO(d));
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const primarySyncState = getPrimarySync(watchStatus);
  const hasActiveWatch = (watchStatus?.activeChannels?.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface">

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-panel p-3 space-y-2">

        {/* Week navigation */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-mono text-muted uppercase tracking-wider">Weekplanning</p>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftWeek(-7)}
              className="px-2 py-1 text-xs font-mono border border-border rounded text-muted hover:text-accent hover:border-accent/50 transition-colors">
              &laquo; Vorige
            </button>
            <button onClick={() => setBaseDate(todayISO())}
              className="px-2 py-1 text-xs font-mono border border-border rounded text-muted hover:text-accent hover:border-accent/50 transition-colors">
              Vandaag
            </button>
            <button onClick={() => shiftWeek(7)}
              className="px-2 py-1 text-xs font-mono border border-border rounded text-muted hover:text-accent hover:border-accent/50 transition-colors">
              Volgende &raquo;
            </button>
          </div>
        </div>

        {/* Quick plan bar */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-2">
          <select value={planningTaskId} onChange={e => setPlanningTaskId(e.target.value)}
            className="xl:col-span-2 px-2 py-1 text-xs font-mono bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60">
            <option value="">Taak plannen...</option>
            {unscheduledTasks.map(t => (
              <option key={t.id} value={t.id}>[{t.priority}] {t.title.slice(0, 40)}</option>
            ))}
          </select>
          <input type="date" value={planningDate} onChange={e => setPlanningDate(e.target.value)}
            className="px-2 py-1 text-xs font-mono bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60" />
          <input type="time" value={planningTime} onChange={e => setPlanningTime(e.target.value)}
            className="px-2 py-1 text-xs font-mono bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60" />
          <div className="flex gap-1.5">
            <input type="number" value={planningMinutes} onChange={e => setPlanningMinutes(Number(e.target.value))}
              min={5} step={5} placeholder="min"
              className="w-16 px-2 py-1 text-xs font-mono bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60" />
            <button onClick={planTask} disabled={!planningTaskId}
              className="flex-1 px-2 py-1 text-xs font-mono rounded border border-accent/50 text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors">
              Plan
            </button>
          </div>
        </div>

        {/* Toggles */}
        <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
          <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} className="accent-accent" />
          Na plannen automatisch naar Google Calendar syncen
        </label>
        <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
          <input type="checkbox" checked={includeGoogle} onChange={e => setIncludeGoogle(e.target.checked)} className="accent-accent" />
          Google Calendar tonen
        </label>

        {/* Connection status */}
        {googleStatus?.googleEnabled && !googleStatus.connected && (
          <div className="flex items-center gap-2 text-xs font-mono border border-warning/30 bg-warning/5 rounded p-2">
            <span className="text-warning">Google Calendar is nog niet gekoppeld.</span>
            <a href="/api/auth/google/start" className="text-accent hover:underline">Koppel &rarr;</a>
          </div>
        )}
        {googleStatus?.googleEnabled && googleStatus.connected && (
          <div className="flex items-center gap-2 text-xs font-mono text-muted">
            <span className="text-success">&#10003;</span>
            <span>Google Calendar gekoppeld</span>
            {hasActiveWatch
              ? <span className="text-success ml-2">&#10003; Watch actief</span>
              : <span className="text-warning ml-2">&#9711; Geen actieve watch</span>}
          </div>
        )}

        {/* Sync panel toggle */}
        {googleStatus?.googleEnabled && googleStatus.connected && (
          <button onClick={() => setShowSyncPanel(v => !v)}
            className="text-xs font-mono text-muted hover:text-accent transition-colors">
            {showSyncPanel ? "▲ Sync details verbergen" : "▼ Sync details & knoppen"}
          </button>
        )}

        {/* ── Sync panel ───────────────────────────────────── */}
        {showSyncPanel && googleStatus?.googleEnabled && googleStatus.connected && (
          <div className="border border-border rounded bg-surface p-3 space-y-3">

            {/* Status grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
              <span className="text-muted">Watch actief:</span>
              <span className={hasActiveWatch ? "text-success" : "text-warning"}>
                {hasActiveWatch
                  ? `Ja (${watchStatus!.activeChannels.length} channel${watchStatus!.activeChannels.length > 1 ? "s" : ""})`
                  : "Nee"}
              </span>
              {hasActiveWatch && watchStatus!.activeChannels[0] && (
                <>
                  <span className="text-muted">Vervalt:</span>
                  <span className="text-gray-800">
                    {fmtTime(new Date(watchStatus!.activeChannels[0].expiration).toISOString())}
                  </span>
                </>
              )}
              <span className="text-muted">Laatste full sync:</span>
              <span className="text-gray-800">{fmtTime(primarySyncState?.lastFullSyncAt)}</span>
              <span className="text-muted">Laatste incr. sync:</span>
              <span className="text-gray-800">{fmtTime(primarySyncState?.lastIncrementalSyncAt)}</span>
              {primarySyncState?.lastError && (
                <>
                  <span className="text-muted">Laatste fout:</span>
                  <span className="text-danger truncate" title={primarySyncState.lastError}>
                    {primarySyncState.lastError.slice(0, 60)}
                  </span>
                </>
              )}
            </div>

            {/* Dev buttons */}
            <div className="flex flex-wrap gap-1.5">
              <button onClick={handleStartWatch} disabled={loadingWatch}
                className="px-2 py-1 text-xs font-mono rounded border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors">
                {loadingWatch ? "..." : "Start watch"}
              </button>
              <button onClick={() => handleSyncNow("incremental")} disabled={loadingIncrSync}
                className="px-2 py-1 text-xs font-mono rounded border border-success/40 text-success hover:bg-success/10 disabled:opacity-40 transition-colors">
                {loadingIncrSync ? "..." : "Sync nu"}
              </button>
              <button onClick={() => handleSyncNow("full")} disabled={loadingFullSync}
                className="px-2 py-1 text-xs font-mono rounded border border-warning/40 text-warning hover:bg-warning/10 disabled:opacity-40 transition-colors">
                {loadingFullSync ? "..." : "Full resync"}
              </button>
              <button onClick={handleRepairSync} disabled={loadingRepairSync}
                className="px-2 py-1 text-xs font-mono rounded border border-warning/40 text-warning hover:bg-warning/10 disabled:opacity-40 transition-colors">
                {loadingRepairSync ? "..." : "Repair sync"}
              </button>
              <button onClick={loadWatchStatus}
                className="px-2 py-1 text-xs font-mono rounded border border-border text-muted hover:text-accent hover:border-accent/40 transition-colors">
                Status verversen
              </button>
            </div>

            {/* Outbox toggle */}
            <label className="flex items-center gap-2 text-xs font-mono text-muted cursor-pointer">
              <input type="checkbox" checked={useOutbox} onChange={e => setUseOutbox(e.target.checked)} className="accent-accent" />
              <span>Gebruik outbox sync</span>
              <span className="text-[10px] text-muted italic">(sync via wachtrij i.p.v. direct)</span>
            </label>

            {/* Recent log */}
            {(watchStatus?.recentLog?.length ?? 0) > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Sync log</p>
                {watchStatus!.recentLog.slice(0, 8).map(item => (
                  <div key={item.id} className="flex items-start gap-2 text-[11px] font-mono">
                    <span className={`shrink-0 ${LOG_TYPE_COLOR[item.type] ?? "text-muted"}`}>
                      [{item.type}]
                    </span>
                    <span className="text-gray-700 break-words min-w-0">{item.message}</span>
                    <span className="shrink-0 text-muted ml-auto">{item.createdAt.slice(11, 16)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-xs font-mono text-danger border border-danger/30 bg-danger/5 rounded p-2">
            {error}
          </div>
        )}
      </div>

      {/* ── Week grid ────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto p-3">
        <div className="grid grid-cols-7 gap-2 min-w-[840px]">
          {weekDays.map(day => {
            const isToday = day === todayISO();
            const dayEvents = events.filter(e => e.start.slice(0, 10) === day);

            return (
              <div key={day}
                className={`border rounded bg-panel flex flex-col min-h-[400px] ${isToday ? "border-accent/50" : "border-border"}`}>
                <div className={`px-2 py-1.5 border-b ${isToday ? "border-accent/30 bg-accent/5" : "border-border"}`}>
                  <p className={`text-xs font-mono font-medium ${isToday ? "text-accent" : "text-gray-800"}`}>
                    {labelDate(day)}
                  </p>
                </div>

                <div className="flex-1 p-1.5 space-y-1.5">
                  {dayEvents.length === 0 ? (
                    <p className="text-[11px] font-mono text-muted italic px-1 pt-1">–</p>
                  ) : (
                    dayEvents.map(event => (
                      <div key={`${event.source}_${event.id}`}
                        className={`p-1.5 rounded border text-xs font-mono ${
                          event.source === "mentor_task"
                            ? "border-accent/30 bg-accent/5"
                            : "border-warning/30 bg-warning/5"
                        }`}>
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[10px] text-muted">
                            {labelTime(event.start)}{event.end ? `–${labelTime(event.end)}` : ""}
                          </span>
                          <span className={`text-[10px] ${event.source === "mentor_task" ? "text-accent" : "text-warning"}`}>
                            {event.source === "mentor_task" ? "taak" : "gcal"}
                          </span>
                        </div>
                        <p className="text-gray-800 leading-snug break-words">{event.title}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {event.source === "mentor_task" && event.taskId && (
                            <button onClick={() => syncTask(event.taskId!)} disabled={loadingSync === event.taskId}
                              className="px-1.5 py-0.5 rounded border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors">
                              {loadingSync === event.taskId ? "..." : "Sync"}
                            </button>
                          )}
                          {event.source === "google_calendar" && (
                            <button onClick={() => importEvent(event)}
                              className="px-1.5 py-0.5 rounded border border-warning/30 text-warning hover:bg-warning/10 transition-colors">
                              Maak taak
                            </button>
                          )}
                          {event.htmlLink && (
                            <a href={event.htmlLink} target="_blank" rel="noreferrer"
                              className="px-1.5 py-0.5 rounded border border-border text-muted hover:text-gray-800 transition-colors">
                              Open
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
