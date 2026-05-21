"use client";
import { useState } from "react";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";

interface Props {
  block: ScheduleBlock;
  task?: MentorTask;
  onClose: () => void;
  onComplete: (taskId: string) => Promise<void>;
  onRemove: (blockId: string) => Promise<void>;
  onSync: (taskId: string) => Promise<void>;
}

const PRIORITY_COLOR: Record<string, string> = {
  P0: "text-red-400 bg-red-400/10",
  P1: "text-orange-400 bg-orange-400/10",
  P2: "text-blue-400 bg-blue-400/10",
  P3: "text-emerald-400 bg-emerald-400/10",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

export default function BlockDetailPanel({ block, task, onClose, onComplete, onRemove, onSync }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key);
    try { await fn(); } finally { setLoading(null); }
  }

  const durationH = Math.floor(block.durationMinutes / 60);
  const durationM = block.durationMinutes % 60;
  const durationStr = durationH > 0
    ? `${durationH}u${durationM > 0 ? ` ${durationM}m` : ""}`
    : `${durationM}m`;

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800 w-72 shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Blok details</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {task?.priority && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${PRIORITY_COLOR[task.priority] ?? "text-zinc-400"}`}>
            {task.priority}
          </span>
        )}

        <h2 className="text-sm font-semibold text-zinc-100 leading-snug">{block.title}</h2>

        {task?.project && (
          <p className="text-xs text-zinc-500">Project: {task.project}</p>
        )}

        <div className="space-y-2 text-xs">
          <div className="flex gap-2">
            <span className="text-zinc-600 w-14 shrink-0">Start</span>
            <span className="text-zinc-300">{fmtDateTime(block.start)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-600 w-14 shrink-0">Einde</span>
            <span className="text-zinc-300">{block.end.slice(11, 16)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-zinc-600 w-14 shrink-0">Duur</span>
            <span className="text-zinc-300">{durationStr}</span>
          </div>
        </div>

        {(task?.hardDeadline ?? task?.deadline) && (
          <div className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${
            block.colorState === "red" ? "bg-red-900/30 text-red-300" :
            block.colorState === "orange" ? "bg-amber-900/30 text-amber-300" :
            "bg-zinc-800 text-zinc-400"
          }`}>
            <span>Deadline {(task.hardDeadline ?? task.deadline)!.slice(0, 10)}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          {block.calendarSynced
            ? <span className="text-emerald-400">✓ Google Calendar gesynchroniseerd</span>
            : <span className="text-zinc-600">Niet gesynchroniseerd met Google</span>
          }
        </div>

        {block.locked && (
          <p className="text-[10px] text-zinc-600">🔒 Handmatig gepland (vergrendeld)</p>
        )}

        {task?.nextAction && (
          <div className="bg-zinc-800/60 rounded-lg p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Volgende actie</p>
            <p className="text-xs text-zinc-300 leading-relaxed">{task.nextAction}</p>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-zinc-800 space-y-2 shrink-0">
        {!block.calendarSynced && block.taskId && (
          <button
            onClick={() => run("sync", () => onSync(block.taskId))}
            disabled={loading === "sync"}
            className="w-full py-2 text-xs font-medium rounded-lg bg-blue-600/20 border border-blue-600/40 text-blue-400 hover:bg-blue-600/30 disabled:opacity-40 transition-colors"
          >
            {loading === "sync" ? "Synchroniseren..." : "↑ Sync naar Google Calendar"}
          </button>
        )}
        {block.taskId && (
          <button
            onClick={() => run("complete", () => onComplete(block.taskId))}
            disabled={loading === "complete"}
            className="w-full py-2 text-xs font-medium rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors"
          >
            {loading === "complete" ? "Voltooien..." : "✓ Taak voltooien"}
          </button>
        )}
        <button
          onClick={() => run("remove", () => onRemove(block.id))}
          disabled={loading === "remove"}
          className="w-full py-2 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40 transition-colors"
        >
          {loading === "remove" ? "Verwijderen..." : "× Verwijder uit planning"}
        </button>
      </div>
    </div>
  );
}
