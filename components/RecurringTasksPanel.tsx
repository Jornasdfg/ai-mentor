"use client";

import { useState } from "react";
import type { MentorRecurringTask } from "@/lib/mentorTypes";
import { getNextOccurrence } from "@/lib/mentor/recurringTaskEngine";

interface RecurringTasksPanelProps {
  templates: MentorRecurringTask[];
  onRefresh: () => void;
  onEdit: (template: MentorRecurringTask) => void;
}

function frequencyLabel(t: MentorRecurringTask): string {
  const DAY_NL = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  if (t.frequency === "daily") {
    return t.interval === 1 ? "Dagelijks" : `Elke ${t.interval} dagen`;
  }
  if (t.frequency === "weekly") {
    const days = (t.daysOfWeek ?? []).map(d => DAY_NL[d]).join(", ");
    const base = t.interval === 1 ? "Wekelijks" : `Elke ${t.interval} weken`;
    return days ? `${base} op ${days}` : base;
  }
  if (t.frequency === "monthly") {
    const day = t.dayOfMonth ? ` (dag ${t.dayOfMonth})` : "";
    return t.interval === 1 ? `Maandelijks${day}` : `Elke ${t.interval} maanden${day}`;
  }
  return t.frequency;
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: "text-danger",
  P1: "text-warning",
  P2: "text-accent",
  P3: "text-muted",
};

export default function RecurringTasksPanel({ templates, onRefresh, onEdit }: RecurringTasksPanelProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [materializing, setMaterializing] = useState(false);
  const [lastMaterializeResult, setLastMaterializeResult] = useState<number | null>(null);

  async function handleToggleActive(template: MentorRecurringTask) {
    setLoadingId(template.id);
    try {
      await fetch(`/api/recurring-tasks/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      onRefresh();
    } finally {
      setLoadingId(null);
    }
  }

  async function handleMaterialize() {
    setMaterializing(true);
    setLastMaterializeResult(null);
    try {
      const res = await fetch("/api/recurring-tasks/materialize", { method: "POST" });
      const data = await res.json() as { newInstancesCreated?: number };
      setLastMaterializeResult(data.newInstancesCreated ?? 0);
      onRefresh();
    } finally {
      setMaterializing(false);
    }
  }

  const active = templates.filter(t => t.isActive);
  const paused = templates.filter(t => !t.isActive);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto p-3 space-y-3">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted">
          {active.length} actief · {paused.length} gepauzeerd
        </span>
        <button
          onClick={handleMaterialize}
          disabled={materializing}
          className="px-3 py-1 text-xs font-mono rounded border border-accent/40 text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
        >
          {materializing ? "Bezig..." : "Genereer komende taken"}
        </button>
      </div>

      {lastMaterializeResult !== null && (
        <div className="px-3 py-1.5 text-xs font-mono rounded border border-success/30 bg-success/5 text-success">
          {lastMaterializeResult === 0
            ? "Geen nieuwe instanties — alles al gegenereerd."
            : `${lastMaterializeResult} nieuwe taak${lastMaterializeResult !== 1 ? "instanties" : "instantie"} aangemaakt.`}
        </div>
      )}

      {templates.length === 0 && (
        <p className="text-xs text-muted font-mono italic p-2">
          Nog geen routines. Klik op "+ Repeterende taak" om er een aan te maken.
        </p>
      )}

      {/* Active templates */}
      {active.map(t => (
        <TemplateRow
          key={t.id}
          template={t}
          onEdit={onEdit}
          onToggle={handleToggleActive}
          isLoading={loadingId === t.id}
        />
      ))}

      {/* Paused templates */}
      {paused.length > 0 && (
        <>
          <p className="text-xs font-mono text-muted uppercase tracking-wider pt-1">Gepauzeerd</p>
          {paused.map(t => (
            <TemplateRow
              key={t.id}
              template={t}
              onEdit={onEdit}
              onToggle={handleToggleActive}
              isLoading={loadingId === t.id}
            />
          ))}
        </>
      )}
    </div>
  );
}

interface TemplateRowProps {
  template: MentorRecurringTask;
  onEdit: (t: MentorRecurringTask) => void;
  onToggle: (t: MentorRecurringTask) => void;
  isLoading: boolean;
}

function TemplateRow({ template, onEdit, onToggle, isLoading }: TemplateRowProps) {
  const nextDate = getNextOccurrence(template);
  const isPaused = !template.isActive;

  return (
    <div className={`p-3 rounded border border-border bg-panel space-y-1.5 ${isPaused ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono font-medium text-gray-100 truncate">
            {template.title}
          </p>
          {template.project && (
            <p className="text-xs text-muted font-mono truncate">{template.project}</p>
          )}
        </div>
        <span className={`text-xs font-mono font-bold shrink-0 ${PRIORITY_COLORS[template.priority] ?? "text-muted"}`}>
          {template.priority}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono text-muted">
        <span>{frequencyLabel(template)}</span>
        {nextDate && !isPaused && <span className="text-accent">Volgende: {nextDate}</span>}
        {template.estimatedMinutes && <span>{template.estimatedMinutes}min</span>}
      </div>

      {template.executionMode === "mcp_ready" && (
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-accent/30 text-accent/70 bg-accent/5">
            MCP-ready
          </span>
          {template.futureMcpAction && (
            <span className="text-xs font-mono text-muted truncate">{template.futureMcpAction}</span>
          )}
        </div>
      )}

      {(template.tags ?? []).filter(t => t !== "recurring").length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(template.tags ?? []).filter(t => t !== "recurring").map(tag => (
            <span key={tag} className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-muted">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 pt-0.5">
        <button
          onClick={() => onEdit(template)}
          className="text-xs font-mono px-2 py-1 rounded border border-border text-muted hover:border-accent hover:text-accent transition-colors"
        >
          Bewerk
        </button>
        <button
          onClick={() => onToggle(template)}
          disabled={isLoading}
          className={`text-xs font-mono px-2 py-1 rounded border transition-colors disabled:opacity-40 ${
            isPaused
              ? "border-success/40 text-success hover:bg-success/10"
              : "border-warning/40 text-warning hover:bg-warning/10"
          }`}
        >
          {isLoading ? "..." : isPaused ? "Activeren" : "Pauzeren"}
        </button>
      </div>
    </div>
  );
}
