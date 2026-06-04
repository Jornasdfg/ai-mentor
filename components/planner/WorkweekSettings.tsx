"use client";

import { useEffect, useState } from "react";
import type { SchedulingWindow } from "@/lib/mentorTypes";

const DAYS = [
  { v: 1, l: "Ma" }, { v: 2, l: "Di" }, { v: 3, l: "Wo" }, { v: 4, l: "Do" },
  { v: 5, l: "Vr" }, { v: 6, l: "Za" }, { v: 7, l: "Zo" },
];
const DAY_FULL: Record<number, string> = { 1: "ma", 2: "di", 3: "wo", 4: "do", 5: "vr", 6: "za", 7: "zo" };

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function WorkweekSettings({ onClose, onSaved }: Props) {
  const [windows, setWindows] = useState<SchedulingWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scheduler/windows")
      .then(r => r.json())
      .then((j: { windows: SchedulingWindow[] }) => setWindows(j.windows ?? []))
      .catch(() => setError("Kon instellingen niet laden"))
      .finally(() => setLoading(false));
  }, []);

  function update(i: number, patch: Partial<SchedulingWindow>) {
    setWindows(ws => ws.map((w, idx) => idx === i ? { ...w, ...patch } : w));
  }
  function toggleDay(i: number, day: number) {
    setWindows(ws => ws.map((w, idx) => {
      if (idx !== i) return w;
      const has = w.daysOfWeek.includes(day);
      return { ...w, daysOfWeek: has ? w.daysOfWeek.filter(d => d !== day) : [...w.daysOfWeek, day].sort((a, b) => a - b) };
    }));
  }
  function addWindow() {
    const now = new Date().toISOString();
    setWindows(ws => [...ws, {
      id: `window_${Date.now()}`, name: "Nieuw venster", type: "work",
      daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00",
      isActive: true, createdAt: now, updatedAt: now,
    }]);
  }
  function removeWindow(i: number) {
    setWindows(ws => ws.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/scheduler/windows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windows }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "Opslaan mislukt");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout");
    } finally {
      setSaving(false);
    }
  }

  // Werkdagen = dagen met minstens één actief venster. Vrije dagen = de rest.
  const workDays = new Set<number>();
  windows.filter(w => w.isActive).forEach(w => w.daysOfWeek.forEach(d => workDays.add(d)));
  const freeDays = DAYS.filter(d => !workDays.has(d.v)).map(d => DAY_FULL[d.v]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Werkweek &amp; vrije dagen</h2>
            <p className="text-[11px] text-zinc-600">Taken worden alleen op werkdagen ingepland.</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 text-xs text-red-600 border border-red-500/30 rounded-lg bg-red-500/5">{error}</div>
          )}

          {loading ? (
            <p className="text-sm text-zinc-600 py-6 text-center">Laden…</p>
          ) : (
            <>
              {/* Samenvatting */}
              <div className="rounded-xl bg-gray-100 px-3 py-2.5 text-xs text-zinc-700">
                <span className="font-semibold text-zinc-900">Werkdagen:</span>{" "}
                {[...workDays].sort((a, b) => a - b).map(d => DAY_FULL[d]).join(", ") || "geen"}
                {" · "}
                <span className="font-semibold text-zinc-900">Vrij:</span>{" "}
                {freeDays.length ? freeDays.join(", ") : "geen"}
              </div>

              {/* Vensters */}
              {windows.map((w, i) => (
                <div key={w.id} className={`rounded-xl border p-3 space-y-2.5 ${w.isActive ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
                  <div className="flex items-center gap-2">
                    <input
                      value={w.name}
                      onChange={e => update(i, { name: e.target.value })}
                      className="flex-1 px-2.5 py-1.5 text-sm font-medium text-zinc-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500/60"
                    />
                    <button
                      onClick={() => update(i, { isActive: !w.isActive })}
                      title={w.isActive ? "Actief — klik om uit te zetten" : "Uit — klik om aan te zetten"}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${w.isActive ? "bg-emerald-600/15 text-emerald-700 border border-emerald-600/30" : "bg-gray-100 text-zinc-600 border border-gray-200"}`}
                    >
                      {w.isActive ? "Aan" : "Uit"}
                    </button>
                    <button onClick={() => removeWindow(i)} title="Verwijderen" className="px-2 py-1.5 text-zinc-500 hover:text-red-600 transition-colors">🗑</button>
                  </div>

                  {/* Dagen */}
                  <div className="flex gap-1">
                    {DAYS.map(d => {
                      const on = w.daysOfWeek.includes(d.v);
                      return (
                        <button
                          key={d.v}
                          onClick={() => toggleDay(i, d.v)}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-gray-200 hover:border-gray-300"}`}
                        >
                          {d.l}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tijden */}
                  <div className="flex items-center gap-2 text-xs text-zinc-700">
                    <span>van</span>
                    <input type="time" value={w.startTime} onChange={e => update(i, { startTime: e.target.value })}
                      className="px-2 py-1 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500/60" />
                    <span>tot</span>
                    <input type="time" value={w.endTime} onChange={e => update(i, { endTime: e.target.value })}
                      className="px-2 py-1 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500/60" />
                  </div>
                </div>
              ))}

              <button onClick={addWindow}
                className="w-full py-2 text-xs font-medium text-blue-700 border border-dashed border-blue-500/40 rounded-xl hover:bg-blue-500/5 transition-colors">
                + Venster toevoegen (bv. avond of weekend)
              </button>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 text-zinc-600 hover:border-gray-300 transition-colors">Annuleren</button>
          <button onClick={save} disabled={saving || loading}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
            {saving ? "Opslaan…" : "Opslaan & herplannen"}
          </button>
        </div>
      </div>
    </div>
  );
}
