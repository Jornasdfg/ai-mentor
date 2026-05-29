"use client";

import { useState, useEffect } from "react";
import type { MentorTask, MentorPriority, CoveyQuadrant } from "@/lib/mentorTypes";

interface Props {
  task: MentorTask | null;
  onClose: () => void;
  onSave: (updated: Partial<MentorTask>) => void;
}

const PRIORITY_STYLES: Record<string, { active: string; inactive: string }> = {
  P0: { active: "bg-red-500/20 border-red-500 text-red-300",          inactive: "border-zinc-700 text-zinc-500 hover:border-red-600/50 hover:text-red-400"       },
  P1: { active: "bg-orange-500/20 border-orange-500 text-orange-300", inactive: "border-zinc-700 text-zinc-500 hover:border-orange-500/50 hover:text-orange-400"  },
  P2: { active: "bg-blue-500/20 border-blue-500 text-blue-300",       inactive: "border-zinc-700 text-zinc-500 hover:border-blue-500/50 hover:text-blue-400"      },
  P3: { active: "bg-emerald-500/20 border-emerald-500 text-emerald-300", inactive: "border-zinc-700 text-zinc-500 hover:border-emerald-500/50 hover:text-emerald-400" },
};

const Q_STYLES: Record<string, { active: string; inactive: string; sub: string }> = {
  Q1: { active: "bg-red-500/20 border-red-500 text-red-300",        inactive: "border-zinc-700 text-zinc-500 hover:border-red-600/50 hover:text-red-400",       sub: "Urgent & Belangrijk"         },
  Q2: { active: "bg-blue-500/20 border-blue-500 text-blue-300",     inactive: "border-zinc-700 text-zinc-500 hover:border-blue-500/50 hover:text-blue-400",     sub: "Niet Urgent & Belangrijk"    },
  Q3: { active: "bg-orange-500/20 border-orange-500 text-orange-300", inactive: "border-zinc-700 text-zinc-500 hover:border-orange-500/50 hover:text-orange-400", sub: "Urgent & Onbelangrijk"       },
  Q4: { active: "bg-zinc-700 border-zinc-600 text-zinc-300",        inactive: "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-400",        sub: "Niet Urgent & Onbelangrijk"  },
};

const TIME_PRESETS = [
  { label: "15m",  mins: 15  },
  { label: "30m",  mins: 30  },
  { label: "45m",  mins: 45  },
  { label: "1u",   mins: 60  },
  { label: "1,5u", mins: 90  },
  { label: "2u",   mins: 120 },
  { label: "3u",   mins: 180 },
  { label: "4u",   mins: 240 },
];

function minsToLabel(m: number) {
  const h = Math.floor(m / 60), r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}u`;
  return `${h}u ${r}m`;
}

const INPUT = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500/60 placeholder-zinc-600";
const LABEL = "block text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5";

export default function TaskEditorModal({ task, onClose, onSave }: Props) {
  const [title, setTitle]               = useState("");
  const [priority, setPriority]         = useState<MentorPriority>("P2");
  const [quadrant, setQuadrant]         = useState<CoveyQuadrant>("Q2");
  const [hardDeadline, setHard]         = useState("");
  const [softDeadline, setSoft]         = useState("");
  const [estimatedMins, setMins]        = useState<number | null>(null);
  const [customMins, setCustomMins]     = useState("");
  const [nextAction, setNextAction]     = useState("");
  const [autoSchedule, setAutoSchedule] = useState<"auto" | "off">("auto");

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setPriority(task.priority);
    setQuadrant(task.coveyQuadrant ?? "Q2");
    setHard(task.hardDeadline ?? task.deadline ?? "");
    setSoft(task.softDeadline ?? "");
    const m = task.estimatedMinutes ?? null;
    setMins(m);
    setCustomMins(m ? String(m) : "");
    setNextAction(task.nextAction ?? "");
    setAutoSchedule(task.autoSchedule ?? "auto");
  }, [task?.id]);

  if (!task) return null;

  function handleSave() {
    onSave({
      title:            title.trim() || task!.title,
      priority,
      coveyQuadrant:    quadrant,
      hardDeadline:     hardDeadline || null,
      deadline:         hardDeadline || null,
      softDeadline:     softDeadline || null,
      estimatedMinutes: estimatedMins ?? undefined,
      nextAction:       nextAction.trim() || undefined,
      autoSchedule,
    });
  }

  function pickPreset(m: number) {
    setMins(m);
    setCustomMins(String(m));
  }

  function onCustomChange(val: string) {
    setCustomMins(val);
    const n = parseInt(val);
    setMins(isNaN(n) || n <= 0 ? null : n);
  }

  return (
    /* Outer: backdrop + centering. cursor-pointer needed for iOS tap-to-close */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center cursor-pointer"
      onClick={onClose}
    >
      {/* Visible backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet / modal — stopPropagation so tapping inside doesn't close */}
      <div
        className="relative w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] cursor-default"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Taak bewerken</span>
          {/* Large close button — easier to tap on mobile */}
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors text-xl leading-none"
            aria-label="Sluiten"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Planned in Planner — read-only info */}
          {task.plannedStart && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/30 text-emerald-300 text-xs">
              <span>📅</span>
              <div>
                <span className="font-semibold">Ingepland in Planner: </span>
                {new Date(task.plannedStart).toLocaleString("nl-NL", {
                  weekday: "long", day: "numeric", month: "long",
                  hour: "2-digit", minute: "2-digit",
                  timeZone: "Europe/Amsterdam",
                })}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className={LABEL}>Titel</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              className={INPUT}
            />
          </div>

          {/* Priority */}
          <div>
            <label className={LABEL}>Prioriteit</label>
            <div className="flex gap-1.5">
              {(["P0","P1","P2","P3"] as MentorPriority[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${priority === p ? PRIORITY_STYLES[p].active : PRIORITY_STYLES[p].inactive}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Covey quadrant */}
          <div>
            <label className={LABEL}>Covey kwadrant</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(["Q1","Q2","Q3","Q4"] as CoveyQuadrant[]).map(q => (
                <button
                  key={q}
                  onClick={() => setQuadrant(q)}
                  className={`py-2 px-2 text-left rounded-lg border transition-all ${quadrant === q ? Q_STYLES[q].active : Q_STYLES[q].inactive}`}
                >
                  <span className="text-xs font-bold block">{q}</span>
                  <span className="text-[9px] opacity-70 leading-tight">{Q_STYLES[q].sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Deadlines */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Harde deadline</label>
              <input
                type="date"
                value={hardDeadline}
                onChange={e => setHard(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/60 [color-scheme:dark]"
              />
              {hardDeadline && (
                <button onClick={() => setHard("")} className="text-[10px] text-zinc-600 hover:text-red-400 mt-1 transition-colors">× wissen</button>
              )}
            </div>
            <div>
              <label className={LABEL}>Zachte deadline</label>
              <input
                type="date"
                value={softDeadline}
                onChange={e => setSoft(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/60 [color-scheme:dark]"
              />
              {softDeadline && (
                <button onClick={() => setSoft("")} className="text-[10px] text-zinc-600 hover:text-red-400 mt-1 transition-colors">× wissen</button>
              )}
            </div>
          </div>

          {/* Estimated time */}
          <div>
            <label className={LABEL}>
              Geschatte tijd
              {estimatedMins && <span className="ml-2 text-zinc-400 normal-case font-normal tracking-normal">{minsToLabel(estimatedMins)}</span>}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {TIME_PRESETS.map(({ label, mins }) => (
                <button
                  key={mins}
                  onClick={() => pickPreset(mins)}
                  className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
                    estimatedMins === mins
                      ? "bg-blue-500/20 border-blue-500 text-blue-300"
                      : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                placeholder="Eigen tijd…"
                value={customMins}
                onChange={e => onCustomChange(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/60 placeholder-zinc-600"
              />
              <span className="text-xs text-zinc-600 shrink-0">min</span>
              {estimatedMins && (
                <button onClick={() => { setMins(null); setCustomMins(""); }} className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors shrink-0">× wissen</button>
              )}
            </div>
          </div>

          {/* Schedule type */}
          <div>
            <label className={LABEL}>Type inplanning</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setAutoSchedule("auto")}
                className={`py-2 px-3 text-left rounded-lg border transition-all ${autoSchedule === "auto" ? "bg-blue-500/20 border-blue-500 text-blue-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}
              >
                <span className="text-xs font-semibold block">🔄 Flexibel</span>
                <span className="text-[9px] opacity-70">Auto-inplanbaar, beweeglijk</span>
              </button>
              <button
                onClick={() => setAutoSchedule("off")}
                className={`py-2 px-3 text-left rounded-lg border transition-all ${autoSchedule === "off" ? "bg-amber-500/20 border-amber-500 text-amber-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}
              >
                <span className="text-xs font-semibold block">📌 Vast / Deadline</span>
                <span className="text-[9px] opacity-70">Exacte afspraak of harde deadline</span>
              </button>
            </div>
          </div>

          {/* Next action */}
          <div>
            <label className={LABEL}>Volgende actie</label>
            <input
              type="text"
              value={nextAction}
              onChange={e => setNextAction(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Wat is de eerstvolgende concrete stap?"
              className={INPUT}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-medium rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 text-sm font-medium rounded-lg bg-blue-600/20 border border-blue-600/50 text-blue-300 hover:bg-blue-600/30 transition-colors"
          >
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
