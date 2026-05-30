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

const PRIORITY_STYLES: Record<string, { active: string; inactive: string; label: string }> = {
  P0: { active: "bg-red-500/20 border-red-500 text-red-600", inactive: "border-gray-200 text-zinc-600 hover:border-red-600/50 hover:text-red-600", label: "P0" },
  P1: { active: "bg-orange-500/20 border-orange-500 text-orange-700", inactive: "border-gray-200 text-zinc-600 hover:border-orange-500/50 hover:text-orange-700", label: "P1" },
  P2: { active: "bg-blue-500/20 border-blue-500 text-blue-700", inactive: "border-gray-200 text-zinc-600 hover:border-blue-500/50 hover:text-blue-700", label: "P2" },
  P3: { active: "bg-emerald-500/20 border-emerald-500 text-emerald-700", inactive: "border-gray-200 text-zinc-600 hover:border-emerald-500/50 hover:text-emerald-700", label: "P3" },
};

const Q_STYLES: Record<string, { active: string; inactive: string; sub: string }> = {
  Q1: { active: "bg-red-500/20 border-red-500 text-red-600",        inactive: "border-gray-200 text-zinc-600 hover:border-red-600/50 hover:text-red-600",       sub: "Urgent & Belangrijk"        },
  Q2: { active: "bg-blue-500/20 border-blue-500 text-blue-700",     inactive: "border-gray-200 text-zinc-600 hover:border-blue-500/50 hover:text-blue-700",     sub: "Niet Urgent & Belangrijk"   },
  Q3: { active: "bg-orange-500/20 border-orange-500 text-orange-700", inactive: "border-gray-200 text-zinc-600 hover:border-orange-500/50 hover:text-orange-700", sub: "Urgent & Onbelangrijk"      },
  Q4: { active: "bg-gray-100 border-gray-300 text-zinc-700",        inactive: "border-gray-200 text-zinc-600 hover:border-gray-300 hover:text-zinc-600",        sub: "Niet Urgent & Onbelangrijk" },
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

export default function BlockDetailPanel({ block, task, onClose, onComplete, onRemove, onSync, onUpdateTask }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [titleVal, setTitleVal] = useState(task?.title ?? block.title);
  const [currentPriority, setCurrentPriority] = useState<string | null>(task?.priority ?? null);
  const [currentQuadrant, setCurrentQuadrant] = useState<string>(task?.coveyQuadrant ?? "Q2");

  useEffect(() => {
    setTitleVal(task?.title ?? block.title);
    setCurrentPriority(task?.priority ?? null);
    setCurrentQuadrant(task?.coveyQuadrant ?? "Q2");
  }, [block.id, task?.id]);

  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key);
    try { await fn(); } finally { setLoading(null); }
  }

  async function handleSave() {
    if (!block.taskId || !onUpdateTask) { onClose(); return; }
    const newTitle = titleVal.trim();
    if (!newTitle) { onClose(); return; }
    // Always send title so block.title stays in sync even if task.title was already updated
    const updates: Record<string, unknown> = { title: newTitle, coveyQuadrant: currentQuadrant };
    if (currentPriority) updates.priority = currentPriority;
    await run("save", () => onUpdateTask(block.taskId, updates));
    onClose();
  }

  const durationH = Math.floor(block.durationMinutes / 60);
  const durationM = block.durationMinutes % 60;
  const durationStr = durationH > 0
    ? `${durationH}u${durationM > 0 ? ` ${durationM}m` : ""}`
    : `${durationM}m`;

  return (
    <div className="
      fixed sm:static bottom-0 sm:bottom-auto left-0 sm:left-auto right-0 sm:right-auto
      z-50 sm:z-auto
      w-full sm:w-72 sm:shrink-0
      max-h-[88vh] sm:max-h-none sm:h-full
      bg-white border-t sm:border-t-0 sm:border-l border-gray-200
      rounded-t-2xl sm:rounded-none
      flex flex-col overflow-hidden
      shadow-2xl sm:shadow-none
    ">
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-gray-100" />
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Blok details</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-zinc-600 hover:text-zinc-800 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Titel</p>
          {block.taskId && onUpdateTask ? (
            <input
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-sm text-zinc-900 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <h2 className="text-sm font-semibold text-zinc-900 leading-snug">{titleVal}</h2>
          )}
        </div>

        {/* Priority */}
        {block.taskId && onUpdateTask && (
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Prioriteit</p>
            <div className="flex gap-1">
              {["P0","P1","P2","P3"].map(p => {
                const s = PRIORITY_STYLES[p];
                const isActive = currentPriority === p;
                return (
                  <button
                    key={p}
                    onClick={() => setCurrentPriority(p)}
                    disabled={!!loading}
                    className={`flex-1 py-1.5 text-xs font-bold rounded border transition-all ${isActive ? s.active : s.inactive}`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Covey Kwadrant */}
        {block.taskId && onUpdateTask && (
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Covey kwadrant</p>
            <div className="grid grid-cols-2 gap-1">
              {(["Q1","Q2","Q3","Q4"] as const).map(q => {
                const s = Q_STYLES[q];
                return (
                  <button
                    key={q}
                    onClick={() => setCurrentQuadrant(q)}
                    disabled={!!loading}
                    className={`py-1.5 px-2 text-left rounded border transition-all ${currentQuadrant === q ? s.active : s.inactive}`}
                  >
                    <span className="text-[10px] font-bold block">{q}</span>
                    <span className="text-[9px] opacity-70 leading-tight">{s.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {task?.project && (
          <p className="text-xs text-zinc-600">Project: {task.project}</p>
        )}

        {/* Times */}
        <div className="space-y-2 text-xs">
          <div className="flex gap-2">
            <span className="text-zinc-600 w-14 shrink-0">Start</span>
            <span className="text-zinc-700">{fmtDateTime(block.start)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-600 w-14 shrink-0">Einde</span>
            <span className="text-zinc-700">{block.end.slice(11, 16)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-600 w-14 shrink-0">Duur</span>
            <span className="text-zinc-700">{durationStr} <span className="text-zinc-600 italic">(versleep onderrand om aan te passen)</span></span>
          </div>
        </div>

        {(task?.hardDeadline ?? task?.deadline) && (
          <div className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${
            block.colorState === "red" ? "bg-red-900/30 text-red-600" :
            block.colorState === "orange" ? "bg-amber-900/30 text-amber-700" :
            "bg-white text-zinc-600"
          }`}>
            <span>Deadline {(task.hardDeadline ?? task.deadline)!.slice(0, 10)}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          {block.calendarSynced
            ? <span className="text-emerald-700">✓ Google Calendar gesynchroniseerd</span>
            : <span className="text-zinc-600">Niet gesynchroniseerd met Google</span>
          }
        </div>

        {block.locked && (
          <p className="text-[10px] text-zinc-600">🔒 Handmatig gepland (vergrendeld)</p>
        )}

        {task?.nextAction && (
          <div className="bg-white/60 rounded-lg p-3">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Volgende actie</p>
            <p className="text-xs text-zinc-700 leading-relaxed">{task.nextAction}</p>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-200 space-y-2 shrink-0">
        {!block.calendarSynced && block.taskId && (
          <button
            onClick={() => run("sync", () => onSync(block.taskId))}
            disabled={!!loading}
            className="w-full py-2 text-xs font-medium rounded-lg bg-blue-600/20 border border-blue-600/40 text-blue-700 hover:bg-blue-600/30 disabled:opacity-40 transition-colors"
          >
            {loading === "sync" ? "Synchroniseren..." : "↑ Sync naar Google Calendar"}
          </button>
        )}
        {block.taskId && onUpdateTask && (
          <button
            onClick={handleSave}
            disabled={!!loading}
            className="w-full py-2 text-xs font-medium rounded-lg bg-blue-600/20 border border-blue-600/40 text-blue-700 hover:bg-blue-600/30 disabled:opacity-40 transition-colors"
          >
            {loading === "save" ? "Opslaan..." : "↳ Opslaan & sluiten"}
          </button>
        )}
        {block.taskId && (
          <button
            onClick={() => run("complete", () => onComplete(block.taskId))}
            disabled={!!loading}
            className="w-full py-2 text-xs font-medium rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors"
          >
            {loading === "complete" ? "Voltooien..." : "✓ Taak voltooien"}
          </button>
        )}
        <button
          onClick={() => run("remove", () => onRemove(block.id))}
          disabled={!!loading}
          className="w-full py-2 text-xs font-medium rounded-lg border border-gray-200 text-zinc-600 hover:text-zinc-800 hover:border-gray-300 disabled:opacity-40 transition-colors"
        >
          {loading === "remove" ? "Verwijderen..." : "× Verwijder uit planning"}
        </button>
      </div>
    </div>
  );
}
