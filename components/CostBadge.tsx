"use client";

import { useState, useEffect, useRef } from "react";

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
  const [flash, setFlash] = useState(false);
  const prevCost = useRef<number | null>(null);

  async function fetchCost() {
    try {
      const res = await fetch("/api/cost");
      const data = await res.json() as CostSummary;
      setSummary(prev => {
        if (prev !== null && data.totalCostUSD !== prev.totalCostUSD) {
          setFlash(true);
          setTimeout(() => setFlash(false), 800);
        }
        prevCost.current = data.totalCostUSD;
        return data;
      });
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    fetchCost();
    const interval = setInterval(fetchCost, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) fetchCost();
  }, [refreshTrigger]);

  async function handleReset() {
    if (!confirm("Weet je zeker dat je de kostenteller wilt resetten naar $0.00?")) return;
    setResetting(true);
    try {
      await fetch("/api/cost", { method: "DELETE" });
      setSummary(prev => prev ? { ...prev, totalCostUSD: 0, totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0 } : prev);
    } finally {
      setResetting(false);
      setShowDetail(false);
    }
  }

  const cost = summary?.totalCostUSD ?? 0;
  const costColor = cost > 1 ? "text-red-600" : cost > 0.25 ? "text-orange-700" : "text-emerald-700";

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetail(s => !s)}
        title="Klik voor details / reset"
        className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-all font-mono text-sm font-semibold ${
          flash
            ? "border-emerald-500/60 bg-emerald-500/10"
            : "border-gray-200 bg-white/60 hover:border-gray-300"
        } ${costColor}`}
      >
        <span className="text-xs text-zinc-600 font-normal mr-0.5">$</span>
        <span>{cost.toFixed(4)}</span>
        {summary && (
          <span className="text-[10px] text-zinc-600 font-normal ml-0.5">({summary.totalCalls}x)</span>
        )}
      </button>

      {showDetail && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-gray-200 bg-white shadow-xl p-3 space-y-2">
          <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">Kosten overzicht</p>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-zinc-600">Totale kosten</span>
              <span className={`font-bold ${costColor}`}>${cost.toFixed(6)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Aanroepen</span>
              <span className="text-zinc-700">{summary?.totalCalls ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Input tokens</span>
              <span className="text-zinc-700">{(summary?.totalInputTokens ?? 0).toLocaleString("nl-NL")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Output tokens</span>
              <span className="text-zinc-700">{(summary?.totalOutputTokens ?? 0).toLocaleString("nl-NL")}</span>
            </div>
            {summary?.lastUpdated && (
              <div className="flex justify-between">
                <span className="text-zinc-600">Bijgewerkt</span>
                <span className="text-zinc-600 text-[10px]">
                  {new Date(summary.lastUpdated).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            )}
          </div>
          <div className="pt-1.5 border-t border-gray-200">
            <button
              onClick={handleReset}
              disabled={resetting}
              className="text-xs font-mono text-red-500/60 hover:text-red-600 transition-colors disabled:opacity-40"
            >
              {resetting ? "Resetten..." : "↺ Reset naar $0.00"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
