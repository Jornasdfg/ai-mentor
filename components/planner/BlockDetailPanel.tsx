"use client";
import { useState, useEffect } from "react";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";

interface Props {
  block: ScheduleBlock;
  task?: MentorTask;
  onClose: () => void;
  onComplete: (taskId: string) => Promise<void>;
  onRemove: (blockId: string) => Promise<void>;
  onSync: (taskId: string) => Promise<void>;
  onUpdateTask?: (taskId: string, updates: Record<string, unknown>) => Promise<void>;
}

const PRIORITY_STYLES: Record<string, { active: string; inactive: string }> = {
  P0: { active: "bg-red-500 border-red-500 text-white",        inactive: "bg-white border-gray-200 text-zinc-600 hover:border-red-400" },
  P1: { active: "bg-orange-500 border-orange-500 text-white",  inactive: "bg-white border-gray-200 text-zinc-600 hover:border-orange-400" },
  P2: { active: "bg-blue-500 border-blue-500 text-white",      inactive: "bg-white border-gray-200 text-zinc-600 hover:border-blue-400" },
  P3: { active: "bg-emerald-500 border-emerald-500 text-white", inactive: "bg-white border-gray-200 text-zinc-600 hover:border-emerald-400" },
};

const Q_STYLES: Record<string, { active: string; sub: string }> = {
  Q1: { active: "bg-red-500/15 border-red-400 text-red-700",      sub: "Urgent & belangrijk" },
  Q2: { active: "bg-blue-500/15 border-blue-400 text-blue-700",   sub: "Niet urgent & belangrijk" },
  Q3: { active: "bg-orange-500/15 border-orange-400 text-orange-700", sub: "Urgent & onbelangrijk" },
  Q4: { active: "bg-gray-100 border-gray-300 text-zinc-700",      sub: "Niet urgent & onbelangrijk" },
};

function addMinutesLocal(localISO: string, minutes: number): string {
  const d = new Date(localISO);
  d.setMinutes(d.getMinutes() + minutes);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}
function fmtDayLabel(dateISO: string) {
  return new Date(`${dateISO}T12:00:00`).toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam",
  });
}

export default function BlockDetailPanel({ block, task, onClose, onComplete, onRemove, onSync, onUpdateTask }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [titleVal, setTitleVal] = useState(task?.title ?? block.title);
  const [currentPriority, setCurrentPriority] = useState<string | null>(task?.priority ?? null);
  const [currentQuadrant, setCurrentQuadrant] = useState<string>(task?.coveyQuadrant ?? "Q2");
  const [startDate, setStartDate] = useState(block.start.slice(0, 10));
  const [startTime, setStartTime] = useState(block.start.slice(11, 16));
  const [durationMin, setDurationMin] = useState(block.durationMinutes);

  useEffect(() => {
    setTitleVal(task?.title ?? block.title);
    setCurrentPriority(task?.priority ?? null);
    setCurrentQuadrant(task?.coveyQuadrant ?? "Q2");
    setStartDate(block.start.slice(0, 10));
    setStartTime(block.start.slice(11, 16));
    setDurationMin(block.durationMinutes);
  }, [block.id, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = !!block.taskId && !!onUpdateTask;
  const newStart = `${startDate}T${startTime}:00`;
  const newEnd = addMinutesLocal(newStart, Math.max(15, durationMin || 0));
  const timeChanged =
    startDate !== block.start.slice(0, 10) ||
    startTime !== block.start.slice(11, 16) ||
    durationMin !== block.durationMinutes;

  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key);
    try { await fn(); } finally { setLoading(null); }
  }

  async function handleSave() {
    if (!editable) { onClose(); return; }
    const newTitle = titleVal.trim();
    if (!newTitle) { onClose(); return; }
    const updates: Record<string, unknown> = { title: newTitle, coveyQuadrant: currentQuadrant };
    if (currentPriority) updates.priority = currentPriority;
    // Tijd handmatig aangepast → vastpinnen op het nieuwe tijdstip (niet meer auto-verschuiven).
    if (timeChanged) {
      updates.plannedDate = startDate;
      updates.plannedStart = newStart;
      updates.plannedEnd = newEnd;
      updates.plannedMinutes = Math.max(15, durationMin || 0);
      updates.autoSchedule = "off";
      updates.locked = true;
    }
    await run("save", () => onUpdateTask!(block.taskId, updates));
    onClose();
  }

  const durH = Math.floor((durationMin || 0) / 60), durM = (durationMin || 0) % 60;
  const durStr = durH > 0 ? `${durH}u${durM ? ` ${durM}m` : ""}` : `${durM}m`;
  const Label = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[11px] font-semibold text-zinc-500 mb-1.5">{children}</p>
  );

  return (
    <div className="
      fixed sm:static inset-x-0 sm:inset-auto bottom-0 sm:bottom-auto z-50 sm:z-auto
      w-full sm:w-80 sm:shrink-0 max-w-[100vw] sm:max-w-none box-border
      max-h-[90vh] sm:max-h-none sm:h-full
      bg-white border-t sm:border-t-0 sm:border-l border-gray-200
      rounded-t-2xl sm:rounded-none
      flex flex-col overflow-hidden min-w-0
      shadow-2xl sm:shadow-none
    ">
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
        <div className="w-10 h-1.5 rounded-full bg-gray-200" />
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 shrink-0 min-w-0">
        <span className="text-xs font-extrabold text-zinc-700 tracking-wide truncate">Blok details</span>
        <button
          onClick={onClose}
          aria-label="Sluiten"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-zinc-500 hover:text-zinc-800 transition-colors text-xl leading-none shrink-0"
        >×</button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 min-w-0">
        {/* Title */}
        <div className="min-w-0">
          <Label>Titel</Label>
          {editable ? (
            <input
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-blue-500/60"
            />
          ) : (
            <h2 className="text-sm font-semibold text-zinc-900 leading-snug break-anywhere">{titleVal}</h2>
          )}
        </div>

        {/* Tijd aanpassen */}
        <div className="min-w-0">
          <Label>Wanneer</Label>
          {editable ? (
            <div className="space-y-2">
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-blue-500/60"
              />
              <div className="flex gap-2 min-w-0">
                <label className="flex-1 min-w-0">
                  <span className="block text-[10px] text-zinc-500 mb-1">Begintijd</span>
                  <input
                    type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-blue-500/60"
                  />
                </label>
                <label className="w-28 shrink-0">
                  <span className="block text-[10px] text-zinc-500 mb-1">Duur (min)</span>
                  <input
                    type="number" min={15} step={15} value={durationMin}
                    onChange={e => setDurationMin(parseInt(e.target.value) || 0)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:border-blue-500/60"
                  />
                </label>
              </div>
              <p className="text-[11px] text-zinc-500">
                {fmtDayLabel(startDate)} · {startTime}–{newEnd.slice(11, 16)} ({durStr})
                {timeChanged && <span className="text-blue-600 font-medium"> · vastgezet na opslaan</span>}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-700">{fmtDayLabel(startDate)} · {startTime}–{block.end.slice(11, 16)} ({durStr})</p>
          )}
        </div>

        {/* Priority */}
        {editable && (
          <div className="min-w-0">
            <Label>Prioriteit</Label>
            <div className="flex gap-1.5">
              {["P0", "P1", "P2", "P3"].map(p => {
                const s = PRIORITY_STYLES[p];
                const isActive = currentPriority === p;
                return (
                  <button
                    key={p}
                    onClick={() => setCurrentPriority(p)}
                    disabled={!!loading}
                    className={`flex-1 min-w-0 py-2 text-xs font-bold rounded-lg border transition-all active:scale-95 ${isActive ? s.active : s.inactive}`}
                  >{p}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* Covey */}
        {editable && (
          <div className="min-w-0">
            <Label>Covey kwadrant</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => {
                const s = Q_STYLES[q];
                const isActive = currentQuadrant === q;
                return (
                  <button
                    key={q}
                    onClick={() => setCurrentQuadrant(q)}
                    disabled={!!loading}
                    className={`min-w-0 py-2 px-2.5 text-left rounded-lg border transition-all active:scale-95 ${isActive ? s.active : "bg-white border-gray-200 text-zinc-600 hover:border-gray-300"}`}
                  >
                    <span className="text-xs font-bold block">{q}</span>
                    <span className="text-[10px] opacity-70 leading-tight block break-words">{s.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {task?.project && <p className="text-xs text-zinc-600 break-anywhere">Project: {task.project}</p>}

        {(task?.hardDeadline ?? task?.deadline) && (
          <div className={`text-xs px-3 py-1.5 rounded-lg ${
            block.colorState === "red" ? "bg-red-500/10 text-red-700" :
            block.colorState === "orange" ? "bg-amber-500/10 text-amber-700" :
            "bg-gray-100 text-zinc-600"
          }`}>
            Deadline {(task.hardDeadline ?? task.deadline)!.slice(0, 10)}
          </div>
        )}

        <div className="text-xs">
          {block.calendarSynced
            ? <span className="text-emerald-700">✓ Gesynchroniseerd met Google Calendar</span>
            : <span className="text-zinc-500">Niet gesynchroniseerd met Google</span>}
        </div>

        {block.locked && <p className="text-[11px] text-zinc-500">🔒 Handmatig gepland (vergrendeld)</p>}

        {task?.nextAction && (
          <div className="bg-gray-100 rounded-xl p-3 min-w-0">
            <Label>Volgende actie</Label>
            <p className="text-xs text-zinc-700 leading-relaxed break-anywhere">{task.nextAction}</p>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-200 space-y-2 shrink-0" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {!block.calendarSynced && block.taskId && (
          <button
            onClick={() => run("sync", () => onSync(block.taskId))}
            disabled={!!loading}
            className="w-full py-2.5 text-sm font-semibold rounded-full bg-white border border-gray-200 text-zinc-700 hover:border-accent/40 hover:text-accent disabled:opacity-40 active:scale-[0.98] transition-all"
          >{loading === "sync" ? "Synchroniseren…" : "↑ Sync naar Google Calendar"}</button>
        )}
        {editable && (
          <button
            onClick={handleSave}
            disabled={!!loading}
            className="w-full py-2.5 text-sm font-bold rounded-full bg-gradient-to-br from-accent to-accent2 text-white shadow-soft hover:brightness-105 disabled:opacity-50 active:scale-[0.98] transition-all"
          >{loading === "save" ? "Opslaan…" : "Opslaan & sluiten"}</button>
        )}
        {block.taskId && (
          <button
            onClick={() => run("complete", () => onComplete(block.taskId))}
            disabled={!!loading}
            className="w-full py-2.5 text-sm font-semibold rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/25 disabled:opacity-40 active:scale-[0.98] transition-all"
          >{loading === "complete" ? "Voltooien…" : "✓ Taak voltooien"}</button>
        )}
        <button
          onClick={() => run("remove", () => onRemove(block.id))}
          disabled={!!loading}
          className="w-full py-2.5 text-sm font-medium rounded-full border border-gray-200 text-zinc-500 hover:text-red-600 hover:border-red-300 disabled:opacity-40 active:scale-[0.98] transition-all"
        >{loading === "remove" ? "Verwijderen…" : "Verwijder uit planning"}</button>
      </div>
    </div>
  );
}
