"use client";

import type { MentorTask, CoveyQuadrant } from "@/lib/mentorTypes";

interface CoveyMatrixProps {
  tasks: MentorTask[];
  onFilterQuadrant: (q: CoveyQuadrant | null) => void;
  activeFilter: CoveyQuadrant | null;
}

const QUADRANT_CONFIG: Record<CoveyQuadrant, { label: string; sub: string; color: string; borderColor: string }> = {
  Q1: { label: "Q1 — Nu doen", sub: "Urgent + Belangrijk", color: "text-danger", borderColor: "border-danger/30" },
  Q2: { label: "Q2 — Plannen", sub: "Belangrijk, niet urgent", color: "text-accent", borderColor: "border-accent/30" },
  Q3: { label: "Q3 — Beperken", sub: "Urgent, minder belangrijk", color: "text-warning", borderColor: "border-warning/30" },
  Q4: { label: "Q4 — Parkeren", sub: "Niet urgent, niet belangrijk", color: "text-muted", borderColor: "border-border" },
};

export default function CoveyMatrix({ tasks, onFilterQuadrant, activeFilter }: CoveyMatrixProps) {
  const activeTasks = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");

  function getTasksForQuadrant(q: CoveyQuadrant) {
    return activeTasks.filter(t => t.coveyQuadrant === q || (!t.coveyQuadrant && q === "Q4"));
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {(["Q1", "Q2", "Q3", "Q4"] as CoveyQuadrant[]).map(q => {
        const cfg = QUADRANT_CONFIG[q];
        const qTasks = getTasksForQuadrant(q);
        const isActive = activeFilter === q;
        return (
          <button
            key={q}
            onClick={() => onFilterQuadrant(isActive ? null : q)}
            className={`p-3 rounded border text-left transition-colors ${cfg.borderColor} ${
              isActive ? "bg-panel ring-1 ring-accent/40" : "bg-surface hover:bg-panel"
            }`}
          >
            <div className={`text-xs font-mono font-semibold ${cfg.color}`}>{cfg.label}</div>
            <div className="text-xs text-muted mt-0.5">{cfg.sub}</div>
            <div className={`text-lg font-mono font-bold mt-1 ${cfg.color}`}>{qTasks.length}</div>
            {qTasks.slice(0, 2).map(t => (
              <div key={t.id} className="text-xs text-muted truncate mt-0.5">· {t.title}</div>
            ))}
          </button>
        );
      })}
    </div>
  );
}
