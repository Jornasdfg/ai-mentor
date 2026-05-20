"use client";

interface Props {
  warnings: string[];
  lastRunAt?: string | null;
}

export default function ScheduleWarningsPanel({ warnings, lastRunAt }: Props) {
  if (warnings.length === 0) return null;
  return (
    <div className="mx-3 mt-2 p-2 rounded border border-warning/30 bg-warning/5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono text-warning font-bold">⚠ Scheduler waarschuwingen</span>
        {lastRunAt && <span className="text-xs text-muted font-mono">{lastRunAt.slice(0, 16).replace("T", " ")}</span>}
      </div>
      <ul className="space-y-0.5">
        {warnings.map((w, i) => (
          <li key={i} className="text-xs font-mono text-warning/80">• {w}</li>
        ))}
      </ul>
    </div>
  );
}