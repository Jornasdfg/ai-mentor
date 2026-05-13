"use client";

import { useState, useEffect } from "react";

interface CostSummary {
  totalCostUSD: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastUpdated: string;
}

interface CostBadgeProps {
  refreshTrigger?: number;
}

export default function CostBadge({ refreshTrigger }: CostBadgeProps) {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetch("/api/cost")
      .then((r) => r.json())
      .then((data: CostSummary) => setSummary(data))
      .catch(console.error);
  }, [refreshTrigger]);

  async function handleReset() {
    if (!confirm("Weet je zeker dat je de kostenteller wilt resetten naar $0.00?")) return;
    setResetting(true);
    try {
      await fetch("/api/cost", { method: "DELETE" });
      setSummary((prev) =>
        prev ? { ...prev, totalCostUSD: 0, totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0 } : prev
      );
    } finally {
      setResetting(false);
      setShowDetail(false);
    }
  }

  if (!summary) return null;

  const cost = summary.totalCostUSD;
  const costColor = cost > 1 ? "text-danger" : cost > 0.25 ? "text-warning" : "text-success";

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetail((s) => !s)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded border border-border
                    hover:border-muted transition-colors font-mono text-xs ${costColor}`}
        title="Klik voor details"
      >
        <span>$</span>
        <span>{cost.toFixed(4)}</span>
        <span className="text-muted">({summary.totalCalls}x)</span>
      </button>

      {showDetail && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded border border-border bg-panel shadow-lg p-3 space-y-2">
          <p className="text-xs font-mono text-muted uppercase tracking-wider">Kosten overzicht</p>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-muted">Totale kosten</span>
              <span className={costColor}>${cost.toFixed(6)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Aanroepen</span>
              <span className="text-gray-300">{summary.totalCalls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Input tokens</span>
              <span className="text-gray-300">{summary.totalInputTokens.toLocaleString("nl-NL")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Output tokens</span>
              <span className="text-gray-300">{summary.totalOutputTokens.toLocaleString("nl-NL")}</span>
            </div>
          </div>
          <div className="pt-1 border-t border-border">
            <button
              onClick={handleReset}
              disabled={resetting}
              className="text-xs font-mono text-danger/70 hover:text-danger transition-colors disabled:opacity-40"
            >
              {resetting ? "Resetten..." : "Reset teller naar $0.00"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
