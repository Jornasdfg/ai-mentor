"use client";

import { useState, useRef, useEffect } from "react";
import type { MentorAdvice, MentorPatch } from "@/lib/mentorTypes";

interface MentorChatProps {
  onComplete?: () => void;
  onAdvice?: (advice: MentorAdvice) => void;
}

export default function MentorChat({ onComplete, onAdvice }: MentorChatProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<MentorAdvice | null>(null);
  const [patchState, setPatchState] = useState<"pending" | "applied" | "dismissed">("pending");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  async function handleAsk() {
    const msg = input.trim();
    if (!msg || isLoading) return;

    setIsLoading(true);
    setError(null);
    setAdvice(null);
    setPatchState("pending");

    try {
      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: msg }),
      });
      const data = (await res.json()) as MentorAdvice & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Mentor-aanroep mislukt");
      setAdvice(data);
      onAdvice?.(data);
      setInput("");
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApplyPatches(patches: MentorPatch[]) {
    setIsApplying(true);
    try {
      const res = await fetch("/api/mentor/apply-patches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patches }),
      });
      if (!res.ok) throw new Error("Patches toepassen mislukt");
      setPatchState("applied");
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout bij toepassen");
    } finally {
      setIsApplying(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleAsk();
    }
  }

  const proposedPatches = advice?.proposedPatches ?? [];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2 border-b border-border bg-panel shrink-0 flex items-center justify-between">
        <span className="text-xs font-mono text-muted">Mentor Chat</span>
        {advice?.conversationContextUsed && (
          <span className="text-xs font-mono text-muted/50">context geladen</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {!advice && !isLoading && !error && (
          <p className="text-sm text-muted italic font-mono">
            Stel een vraag of beschrijf je situatie. De mentor analyseert je taken en geeft prioriteitsadvies.
          </p>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted font-mono">
            <span className="animate-pulse">&#9679;</span>
            <span>Mentor analyseert...</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded border border-danger/40 bg-danger/10 text-sm text-danger font-mono">
            {error}
          </div>
        )}

        {advice && (
          <div className="space-y-4">
            {advice.parseError && (
              <div className="p-2 rounded border border-warning/30 bg-warning/5 text-xs text-warning font-mono">
                Waarschuwing: output kon niet volledig worden geparseerd.
              </div>
            )}

            {/* Advies */}
            <div className="p-4 rounded border border-border bg-surface">
              <pre className="text-sm text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
                {advice.adviceText}
              </pre>
            </div>

            {/* Upcoming warnings */}
            {(advice.upcomingWarnings ?? []).length > 0 && (
              <div className="space-y-1">
                {(advice.upcomingWarnings ?? []).map((w, i) => (
                  <div key={i} className="px-3 py-2 rounded border border-warning/30 bg-warning/5 text-xs font-mono text-warning">
                    {w.title}{w.daysUntilDeadline !== undefined ? ` — ${w.daysUntilDeadline}d` : ""}: {w.message}
                  </div>
                ))}
              </div>
            )}

            {/* Today tasks */}
            {(advice.todayTasks ?? []).length > 0 && (
              <div className="p-3 rounded border border-border bg-surface">
                <p className="text-xs font-mono text-muted uppercase tracking-wider mb-2">Vandaag</p>
                <div className="space-y-1">
                  {(advice.todayTasks ?? []).map((t, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs font-mono">
                      <span className={`shrink-0 font-bold ${t.priority === "P0" ? "text-danger" : t.priority === "P1" ? "text-warning" : "text-accent"}`}>
                        {t.priority}
                      </span>
                      <span className="text-gray-200">{t.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Do not do */}
            {(advice.doNotDo ?? []).length > 0 && (
              <div className="p-3 rounded border border-danger/20 bg-surface">
                <p className="text-xs font-mono text-danger/70 uppercase tracking-wider mb-2">Niet doen vandaag</p>
                {(advice.doNotDo ?? []).map((d, i) => (
                  <p key={i} className="text-xs font-mono text-muted">x {d.title}</p>
                ))}
              </div>
            )}

            {/* Proposed patches */}
            {proposedPatches.length > 0 && patchState === "pending" && (
              <div className="p-4 rounded border border-accent/30 bg-accent/5 space-y-3">
                <p className="text-xs font-mono text-accent uppercase tracking-wider">
                  {proposedPatches.length} voorgestelde wijziging{proposedPatches.length !== 1 ? "en" : ""}
                </p>
                <div className="space-y-1">
                  {proposedPatches.slice(0, 5).map((p, i) => (
                    <p key={i} className="text-xs font-mono text-muted">
                      · {p.operation}: {(p.data as { title?: string }).title ?? p.taskId ?? ""}
                      {p.reason ? ` — ${p.reason}` : ""}
                    </p>
                  ))}
                  {proposedPatches.length > 5 && (
                    <p className="text-xs font-mono text-muted">...en {proposedPatches.length - 5} meer</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApplyPatches(proposedPatches)}
                    disabled={isApplying}
                    className="px-4 py-1.5 text-sm font-mono rounded border border-success text-success hover:bg-success/10 disabled:opacity-40 transition-colors"
                  >
                    {isApplying ? "Bezig..." : "Toepassen"}
                  </button>
                  <button
                    onClick={() => setPatchState("dismissed")}
                    className="px-4 py-1.5 text-sm font-mono rounded border border-border text-muted hover:border-danger hover:text-danger transition-colors"
                  >
                    Negeren
                  </button>
                </div>
              </div>
            )}

            {patchState === "applied" && (
              <div className="px-3 py-2 text-xs text-success border border-success/30 rounded bg-success/10 font-mono">
                Wijzigingen toegepast — taken bijgewerkt.
              </div>
            )}

            {patchState === "dismissed" && (
              <div className="px-3 py-2 text-xs text-muted border border-border rounded bg-panel font-mono">
                Wijzigingen genegeerd.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-panel p-3 space-y-2 shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Beschrijf je situatie of stel een vraag... (Ctrl+Enter)"
          rows={2}
          className="w-full px-3 py-2 font-mono text-sm bg-surface text-gray-200 border border-border rounded resize-none focus:outline-none focus:border-accent/60 placeholder-muted leading-relaxed"
        />
        <div className="flex items-center justify-between">
          {advice?.stateSummary && (
            <span className="text-xs font-mono text-muted">
              {advice.stateSummary.openTasks} open · {advice.stateSummary.p0Count} P0 · {advice.stateSummary.p1Count} P1
            </span>
          )}
          <button
            onClick={handleAsk}
            disabled={!input.trim() || isLoading}
            className="px-4 py-1.5 text-sm font-mono rounded border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
          >
            {isLoading ? "Bezig..." : "Vraag mentor"}
          </button>
        </div>
      </div>
    </div>
  );
}
