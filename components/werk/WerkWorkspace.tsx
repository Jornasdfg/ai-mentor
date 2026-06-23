"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Standalone Werk-tool (Van Vijven Transport). Geen koppeling met de rest van de app.
interface WorkHours {
  id: string; date: string; hours: number; start: string | null; end: string | null;
  note: string | null; airtableRecordId: string | null;
}
interface Vrachtbon { id: string; date: string; description: string | null; imageFile: string | null; }

function todayISO() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }); }
const inputCls = "w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface focus:outline-none focus:border-accent text-zinc-800";

export default function WerkWorkspace() {
  const [tab, setTab] = useState<"uren" | "vrachtbonnen">("uren");
  const [hours, setHours] = useState<WorkHours[]>([]);
  const [freight, setFreight] = useState<Vrachtbon[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [h, f] = await Promise.all([
        fetch("/api/werk/hours").then(r => r.json()),
        fetch("/api/werk/freight").then(r => r.json()),
      ]);
      setHours(h.hours ?? []);
      setFreight(f.freight ?? []);
    } catch { /* stil */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-surface">
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border bg-panel">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-zinc-800">🚚 Van Vijven Transport</span>
          <a
            href="/werk/werkgever" target="_blank" rel="noreferrer"
            className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent/10 text-accent hover:bg-accent/20"
            title="Open de werkgever-weergave (deelbare link)"
          >👁 Werkgever-link</a>
        </div>
        <div className="flex gap-2 mt-3">
          {(["uren", "vrachtbonnen"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${tab === t ? "border-accent bg-accent/10 text-accent" : "border-border text-zinc-500"}`}>
              {t === "uren" ? "Uren" : "Vrachtbonnen"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? <p className="text-center text-sm text-zinc-400 mt-8">Laden…</p>
          : tab === "uren" ? <UrenTab hours={hours} onChange={load} />
          : <VrachtbonnenTab freight={freight} onChange={load} />}
      </div>
    </div>
  );
}

function UrenTab({ hours, onChange }: { hours: WorkHours[]; onChange: () => void }) {
  const [date, setDate] = useState(todayISO());
  const [h, setH] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const total = useMemo(() => hours.reduce((s, x) => s + (x.hours || 0), 0), [hours]);

  async function add() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/werk/hours", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, hours: h, start, end, note }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Mislukt");
      setMsg(j.airtable ? "✓ Toegevoegd + naar Airtable" : "✓ Toegevoegd");
      setH(""); setStart(""); setEnd(""); setNote("");
      onChange();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Mislukt"); }
    finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!confirm("Deze urenregel verwijderen?")) return;
    await fetch(`/api/werk/hours/${id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div className="p-3 space-y-3">
      <div className="rounded-xl bg-panel border border-border p-3 space-y-2 shadow-soft">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-[11px] font-semibold text-zinc-600 mb-1">Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} /></div>
          <div><label className="block text-[11px] font-semibold text-zinc-600 mb-1">Uren</label><input value={h} onChange={e => setH(e.target.value)} inputMode="decimal" placeholder="bv. 8,5" className={inputCls} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-[11px] font-semibold text-zinc-600 mb-1">Begin (optioneel)</label><input type="time" value={start} onChange={e => setStart(e.target.value)} className={inputCls} /></div>
          <div><label className="block text-[11px] font-semibold text-zinc-600 mb-1">Eind (optioneel)</label><input type="time" value={end} onChange={e => setEnd(e.target.value)} className={inputCls} /></div>
        </div>
        <p className="text-[10px] text-zinc-400">Tip: vul begin + eind in en laat uren leeg — dan reken ik de uren uit.</p>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Notitie (optioneel)" className={inputCls} />
        <button onClick={add} disabled={busy} className="w-full py-2.5 text-sm font-bold rounded-xl bg-gradient-to-br from-accent to-accent2 text-white shadow-soft active:scale-95 disabled:opacity-60">{busy ? "Opslaan…" : "+ Uren toevoegen"}</button>
        {msg && <p className="text-xs text-center text-zinc-600">{msg}</p>}
      </div>

      <div className="rounded-xl bg-surface border border-border px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">Totaal geregistreerd</span>
        <span className="text-sm font-extrabold text-accent">{total.toFixed(2).replace(".", ",")} uur</span>
      </div>

      <div className="space-y-2">
        {hours.length === 0 ? <p className="text-center text-sm text-zinc-400 mt-6">Nog geen uren.</p>
          : hours.map(x => (
            <div key={x.id} className="flex items-center gap-3 rounded-xl bg-panel border border-border p-2.5 shadow-soft">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-zinc-800">{x.hours.toFixed(2).replace(".", ",")} uur {x.airtableRecordId && <span title="In Airtable" className="text-[10px]">🟢</span>}</div>
                <div className="text-[11px] text-zinc-500">{x.date}{x.start && x.end ? ` · ${x.start}–${x.end}` : ""}{x.note ? ` · ${x.note}` : ""}</div>
              </div>
              <button onClick={() => del(x.id)} className="text-[11px] text-zinc-400 hover:text-danger shrink-0">wis</button>
            </div>
          ))}
      </div>
    </div>
  );
}

function VrachtbonnenTab({ freight, onChange }: { freight: Vrachtbon[]; onChange: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  async function add() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("photo", file); fd.append("date", date); fd.append("description", desc);
      const res = await fetch("/api/werk/freight", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Mislukt");
      setFile(null); setDesc("");
      onChange();
    } catch { /* toon niets uitgebreid */ }
    finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!confirm("Deze vrachtbon verwijderen?")) return;
    await fetch(`/api/werk/freight/${id}`, { method: "DELETE" });
    onChange();
  }

  return (
    <div className="p-3 space-y-3">
      <div className="rounded-xl bg-panel border border-border p-3 space-y-2 shadow-soft">
        <label className="block text-[11px] font-semibold text-zinc-600">Vrachtbon fotograferen</label>
        <input type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-zinc-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-accent/10 file:text-accent file:font-semibold" />
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Omschrijving (optioneel)" className={inputCls} />
        </div>
        <button onClick={add} disabled={busy || !file} className="w-full py-2.5 text-sm font-bold rounded-xl bg-gradient-to-br from-accent to-accent2 text-white shadow-soft active:scale-95 disabled:opacity-60">{busy ? "Opslaan…" : "+ Vrachtbon toevoegen"}</button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {freight.length === 0 ? <p className="col-span-3 text-center text-sm text-zinc-400 mt-6">Nog geen vrachtbonnen.</p>
          : freight.map(v => (
            <div key={v.id} className="relative rounded-xl overflow-hidden border border-border bg-panel">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/werk/freight/${v.id}/image`} alt="" onClick={() => setZoom(`/api/werk/freight/${v.id}/image`)} className="w-full h-24 object-cover cursor-zoom-in" />
              <div className="px-1.5 py-1 flex items-center justify-between">
                <span className="text-[9px] text-zinc-500 truncate">{v.date}</span>
                <button onClick={() => del(v.id)} className="text-[9px] text-zinc-400 hover:text-danger">wis</button>
              </div>
            </div>
          ))}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
