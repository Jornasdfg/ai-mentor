"use client";
import { useState } from "react";

interface Props {
  lastRunAt?: string | null;
  blocksCount: number;
  warningsCount: number;
  googleConnected: boolean;
  onRecalculate: () => Promise<void>;
  // Dev tools
  onFullSync?: () => Promise<void>;
  onRepairSync?: () => Promise<void>;
}

export default function SchedulerToolbar({
  lastRunAt, blocksCount, warningsCount, googleConnected,
  onRecalculate, onFullSync, onRepairSync,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [showDev, setShowDev] = useState(false);

  async function handleRecalc() {
    setLoading(true);
    try { await onRecalculate(); } finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-b border-border bg-panel shrink-0">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleRecalc}
          disabled={loading}
          className="px-3 py-1 text-xs font-mono rounded border border-accent/50 text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
        >
          {loading ? "Plannen…" : "↺ Herplan"}
        </button>

        <div className="flex items-center gap-2 text-xs font-mono text-muted">
          <span>{blocksCount} blocks</span>
          {warningsCount > 0 && <span className="text-warning">⚠ {warningsCount}</span>}
          {lastRunAt && <span>Laatste run: {lastRunAt.slice(0, 16).replace("T", " ")}</span>}
          <span className={googleConnected ? "text-success" : "text-muted"}>
            {googleConnected ? "● Google" : "○ Google"}
          </span>
        </div>

        <button
          onClick={() => setShowDev(v => !v)}
          className="ml-auto text-xs font-mono text-muted hover:text-gray-800 transition-colors"
        >
          {showDev ? "▼ Dev" : "▶ Dev"}
        </button>
      </div>

      {showDev && (
        <div className="flex gap-2 pt-1 border-t border-border/50">
          <span className="text-xs font-mono text-muted self-center">Dev:</span>
          {onFullSync && (
            <button onClick={onFullSync} className="text-xs font-mono px-2 py-0.5 rounded border border-border text-muted hover:text-accent hover:border-accent/40 transition-colors">
              Full sync
            </button>
          )}
          {onRepairSync && (
            <button onClick={onRepairSync} className="text-xs font-mono px-2 py-0.5 rounded border border-border text-muted hover:text-accent hover:border-accent/40 transition-colors">
              Repair sync
            </button>
          )}
        </div>
      )}
    </div>
  );
}