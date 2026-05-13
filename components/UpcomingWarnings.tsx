"use client";

import type { MentorAdvice } from "@/lib/mentorTypes";

interface UpcomingWarningsProps {
  advice: MentorAdvice | null;
}

export default function UpcomingWarnings({ advice }: UpcomingWarningsProps) {
  const warnings = advice?.upcomingWarnings ?? [];
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-mono text-warning uppercase tracking-wider">Voorbereiding vereist</span>
      {warnings.map((w, i) => (
        <div key={i} className="p-2.5 rounded border border-warning/30 bg-warning/5 text-xs font-mono">
          <span className="text-warning font-semibold">{w.title}</span>
          {w.daysUntilDeadline !== undefined && (
            <span className="text-muted ml-2">over {w.daysUntilDeadline} dag{w.daysUntilDeadline === 1 ? "" : "en"}</span>
          )}
          <p className="text-muted mt-0.5">{w.message}</p>
        </div>
      ))}
    </div>
  );
}
