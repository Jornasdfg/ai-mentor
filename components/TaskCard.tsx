"use client";

import { useState } from "react";
import type { MentorTask } from "@/lib/mentorTypes";

interface TaskCardProps {
  task: MentorTask;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onPark: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (task: MentorTask) => void;
  onUpdatePriority?: (id: string, priority: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

const BORDER: Record<string, string> = {
  P0: "border-l-red-500",
  P1: "border-l-orange-400",
  P2: "border-l-blue-500",
  P3: "border-l-zinc-600",
};

const BADGE: Record<string, string> = {
  P0: "bg-red-500/15 text-red-600 border-red-500/30 hover:bg-red-500/25",
  P1: "bg-orange-500/15 text-orange-700 border-orange-500/30 hover:bg-orange-500/25",
  P2: "bg-blue-500/15 text-blue-700 border-blue-500/30 hover:bg-blue-500/25",
  P3: "bg-white text-zinc-600 border-gray-200 hover:bg-gray-200",
};

const Q_COLOR: Record<string, string> = {
  Q1: "text-red-600",
  Q2: "text-blue-700",
  Q3: "text-orange-700",
  Q4: "text-zinc-600",
};

function fmtPlanned(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

export default function TaskCard({
  task,
  onComplete,
  onCancel,
  onPark,
  onReopen,
  onEdit,
  onUpdatePriority,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const [confirming, setConfirming] = useState(false);

  const isDone   = task.status === "done" || task.status === "cancelled";
  const isParked = task.status === "parked";
  const deadline = task.hardDeadline ?? task.deadline;
  const canDrag  = !isDone && !!onDragStart;

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const in3d  = new Date(Date.now() + 3 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const dlCls = !deadline ? "" : deadline < today ? "text-red-600" : deadline <= in3d ? "text-amber-700" : "text-zinc-600";

  function cyclePriority(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onUpdatePriority || isDone) return;
    const idx = PRIORITIES.indexOf(task.priority as typeof PRIORITIES[number]);
    onUpdatePriority(task.id, PRIORITIES[(idx + 1) % PRIORITIES.length]);
  }

  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(task)}
      className={`
        border border-gray-200 border-l-2 rounded-lg bg-white select-none
        ${BORDER[task.priority] ?? "border-l-zinc-600"}
        ${isDone ? "opacity-40" : "hover:border-gray-300 hover:bg-gray-100/80 active:bg-white"}
        cursor-pointer transition-colors
      `}
    >
      <div className="p-2.5 space-y-1.5">

        {/* Row 1: priority badge + quadrant + deadline */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={cyclePriority}
            disabled={!onUpdatePriority || isDone}
            title={onUpdatePriority && !isDone ? "Klik om prioriteit te wisselen" : undefined}
            className={`
              text-[10px] font-bold px-1.5 py-0.5 rounded border transition-all shrink-0
              ${BADGE[task.priority] ?? ""}
              ${onUpdatePriority && !isDone ? "cursor-pointer" : "cursor-default"}
            `}
          >
            {task.priority}
          </button>

          {task.coveyQuadrant && (
            <span className={`text-[9px] font-bold shrink-0 ${Q_COLOR[task.coveyQuadrant] ?? "text-zinc-600"}`}>
              {task.coveyQuadrant}
            </span>
          )}

          {deadline && (
            <span className={`ml-auto text-[9px] font-mono tabular-nums shrink-0 ${dlCls}`}>
              {deadline.slice(5)}
            </span>
          )}
        </div>

        {/* Title */}
        <p className={`text-xs leading-snug ${isDone ? "line-through text-zinc-600" : "text-zinc-800"}`}>
          {task.title}
        </p>

        {/* Planned in Planner */}
        {task.plannedStart && !isDone && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-500/80">
            <span>📅</span>
            <span className="font-mono">{fmtPlanned(task.plannedStart)}</span>
          </div>
        )}

        {/* Project / next action */}
        {(task.project || task.nextAction) && (
          <div className="space-y-0.5">
            {task.project    && <p className="text-[10px] text-zinc-600 truncate">{task.project}</p>}
            {task.nextAction && <p className="text-[10px] text-blue-700/70 truncate">→ {task.nextAction}</p>}
          </div>
        )}

        {/* Actions */}
        {confirming ? (
          <div className="flex items-center gap-2 pt-0.5">
            <span className="text-[10px] text-zinc-600">Zeker annuleren?</span>
            <button
              onClick={e => { e.stopPropagation(); onCancel(task.id); setConfirming(false); }}
              className="text-[10px] text-red-600 hover:underline"
            >Ja</button>
            <button
              onClick={e => { e.stopPropagation(); setConfirming(false); }}
              className="text-[10px] text-zinc-600 hover:underline"
            >Nee</button>
          </div>
        ) : isDone ? (
          <button
            onClick={e => { e.stopPropagation(); onReopen(task.id); }}
            className="text-[10px] px-2 py-0.5 rounded border border-gray-200 text-zinc-600 hover:text-zinc-800 hover:border-gray-300 transition-colors"
          >
            Heropenen
          </button>
        ) : (
          <div className="flex items-center gap-1 pt-0.5">
            <button
              onClick={e => { e.stopPropagation(); onComplete(task.id); }}
              className="text-[10px] px-2 py-0.5 rounded border border-emerald-800/60 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
              title="Voltooien"
            >
              ✓ Klaar
            </button>
            {!isParked && (
              <button
                onClick={e => { e.stopPropagation(); onPark(task.id); }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-zinc-600 hover:text-amber-700 hover:border-amber-700/60 transition-colors"
                title="Parkeren"
              >
                ⏸
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); setConfirming(true); }}
              className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-zinc-600 hover:text-red-600 hover:border-red-800/60 transition-colors"
              title="Annuleren"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
