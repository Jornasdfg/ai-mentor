"use client";

import type { MentorAdvice, MentorTask, TaskAnalysis } from "@/lib/mentorTypes";

interface DailyFocusProps {
  advice: MentorAdvice | null;
  topTask: MentorTask | null;
  topAnalysis: TaskAnalysis | null;
}

export default function DailyFocus({ advice, topTask, topAnalysis }: DailyFocusProps) {
  if (!advice && !topTask) {
    return (
      <div className="p-4 rounded border border-border bg-panel">
        <p className="text-xs text-muted font-mono italic">Stel een vraag aan de mentor of bekijk je taken hieronder.</p>
      </div>
    );
  }

  const top = advice?.topPriority;

  return (
    <div className="p-4 rounded border border-accent/30 bg-panel space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-accent uppercase tracking-wider">Vandaag niet onderhandelbaar</span>
        {topAnalysis && (
          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-danger/20 text-danger border border-danger/30">
            {topAnalysis.coveyQuadrant}
          </span>
        )}
      </div>
      {top ? (
        <>
          <p className="text-sm font-mono font-semibold text-gray-900">{top.title}</p>
          <p className="text-xs text-muted">{top.reason}</p>
        </>
      ) : topTask ? (
        <>
          <p className="text-sm font-mono font-semibold text-gray-900">{topTask.title}</p>
          {topTask.project && <p className="text-xs text-muted">{topTask.project}</p>}
        </>
      ) : null}
      {topTask && (
        <div className="flex flex-wrap gap-3 text-xs text-muted font-mono pt-1">
          {(topTask.hardDeadline ?? topTask.deadline) && (
            <span>Deadline: {topTask.hardDeadline ?? topTask.deadline}</span>
          )}
          {topTask.softDeadline && <span>Zacht: {topTask.softDeadline}</span>}
          {topTask.estimatedMinutes && <span>~{topTask.estimatedMinutes} min</span>}
          {topTask.nextAction && <span className="text-accent">-&gt; {topTask.nextAction}</span>}
        </div>
      )}
    </div>
  );
}
