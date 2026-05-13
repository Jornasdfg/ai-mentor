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
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: "text-danger border-danger/40 bg-danger/10",
  P1: "text-warning border-warning/40 bg-warning/10",
  P2: "text-accent border-accent/40 bg-accent/10",
  P3: "text-muted border-border bg-surface",
};

const QUADRANT_COLORS: Record<string, string> = {
  Q1: "text-danger",
  Q2: "text-accent",
  Q3: "text-warning",
  Q4: "text-muted",
};

const STATUS_BADGE: Record<string, string> = {
  open: "text-success",
  in_progress: "text-accent",
  done: "text-muted line-through",
  parked: "text-muted",
  cancelled: "text-danger line-through",
};

export default function TaskCard({ task, onComplete, onCancel, onPark, onReopen, onEdit }: TaskCardProps) {
  const [confirming, setConfirming] = useState<"cancel" | null>(null);
  const isDone = task.status === "done" || task.status === "cancelled";
  const isParked = task.status === "parked";

  const deadline = task.hardDeadline ?? task.deadline;

  return (
    <div className={`p-3 rounded border border-border bg-panel space-y-2 ${isDone ? "opacity-50" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-mono font-medium truncate ${STATUS_BADGE[task.status] ?? "text-gray-200"}`}>
            {task.title}
          </p>
          {task.project && (
            <p className="text-xs text-muted font-mono truncate">{task.project}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {task.coveyQuadrant && (
            <span className={`text-xs font-mono font-bold ${QUADRANT_COLORS[task.coveyQuadrant] ?? "text-muted"}`}>
              {task.coveyQuadrant}
            </span>
          )}
          <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[task.priority] ?? ""}`}>
            {task.priority}
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2 text-xs font-mono text-muted">
        {deadline && <span>Deadline: {deadline}</span>}
        {task.softDeadline && <span>Zacht: {task.softDeadline}</span>}
        {task.estimatedMinutes && <span>{task.estimatedMinutes}min</span>}
        {task.nextAction && <span className="text-accent">-&gt; {task.nextAction}</span>}
        {task.plannedStart && (
          <span className="text-success">
            Gepland: {task.plannedStart.slice(0, 10)} {task.plannedStart.slice(11, 16)}
          </span>
        )}
        {task.calendarLink?.syncStatus === "synced" && (
          <span className="text-accent">
            {task.calendarLink.provider === "google" ? "Google synced ✓" : "gcal ✓"}
          </span>
        )}
        {task.calendarLink?.syncStatus === "error" && (
          <span className="text-danger" title={task.calendarLink.syncError ?? undefined}>
            sync fout
          </span>
        )}
      </div>

      {/* Tags */}
      {(task.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(task.tags ?? []).filter(t => t !== "stale_seed").map(tag => (
            <span key={tag} className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-muted">
              {tag}
            </span>
          ))}
          {(task.tags ?? []).includes("stale_seed") && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-warning/10 border border-warning/30 text-warning">
              verlopen seed
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {confirming === "cancel" ? (
        <div className="flex gap-2 pt-1">
          <span className="text-xs text-muted font-mono">Zeker annuleren?</span>
          <button onClick={() => { onCancel(task.id); setConfirming(null); }} className="text-xs font-mono text-danger hover:underline">Ja</button>
          <button onClick={() => setConfirming(null)} className="text-xs font-mono text-muted hover:underline">Nee</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {!isDone && !isParked && (
            <button onClick={() => onComplete(task.id)} className="text-xs font-mono px-2 py-1 rounded border border-success/40 text-success hover:bg-success/10 transition-colors">Klaar</button>
          )}
          {!isDone && (
            <button onClick={() => onEdit(task)} className="text-xs font-mono px-2 py-1 rounded border border-border text-muted hover:border-accent hover:text-accent transition-colors">Bewerk</button>
          )}
          {!isDone && !isParked && (
            <button onClick={() => onPark(task.id)} className="text-xs font-mono px-2 py-1 rounded border border-border text-muted hover:border-warning hover:text-warning transition-colors">Park</button>
          )}
          {!isDone && (
            <button onClick={() => setConfirming("cancel")} className="text-xs font-mono px-2 py-1 rounded border border-border text-muted hover:border-danger hover:text-danger transition-colors">Annuleer</button>
          )}
          {isDone && (
            <button onClick={() => onReopen(task.id)} className="text-xs font-mono px-2 py-1 rounded border border-border text-muted hover:border-accent hover:text-accent transition-colors">Heropenen</button>
          )}
        </div>
      )}
    </div>
  );
}
