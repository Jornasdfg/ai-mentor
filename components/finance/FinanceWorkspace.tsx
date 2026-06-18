"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Standalone financiën-tab. Geen koppeling met taken/planner.
type ReceiptKind = "zakelijk" | "prive" | "onbekend";
type DocType = "bon" | "factuur";
type PaymentStatus = "betaald" | "openstaand" | "onbekend";
interface Receipt {
  id: string;
  docType: DocType;
  description: string;
  merchant: string | null;
  kind: ReceiptKind;
  amountCents: number | null;
  currency: string;
  date: string;
  category: string | null;
  paymentStatus: PaymentStatus;
  imageFile: string | null;
  source: "shortcut" | "manual" | "gmail";
  sourceUrl: string | null;
  note: string | null;
  aiAnalyzed: boolean;
  reviewed: boolean;
  createdAt: string;
}

const PAY_BADGE: Record<PaymentStatus, string> = {
  betaald: "bg-emerald-100 text-emerald-700",
  openstaand: "bg-red-100 text-red-700",
  onbekend: "bg-gray-100 text-zinc-500",
};
const PAY_LABEL: Record<PaymentStatus, string> = { betaald: "Betaald", openstaand: "Openstaand", onbekend: "Betaling?" };

const MONTHS_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

function eur(cents: number | null): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

const KIND_BADGE: Record<ReceiptKind, string> = {
  zakelijk: "bg-accent/15 text-accent",
  prive: "bg-emerald-100 text-emerald-700",
  onbekend: "bg-gray-100 text-zinc-500",
};
const KIND_LABEL: Record<ReceiptKind, string> = { zakelijk: "Zakelijk", prive: "Privé", onbekend: "?" };

export default function FinanceWorkspace() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<string>(() => monthKey(new Date()));
  const [showAll, setShowAll] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Receipt | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/receipts");
      const data = await res.json() as { receipts: Receipt[] };
      setReceipts(data.receipts ?? []);
    } catch { /* stil */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const months = useMemo(() => {
    const set = new Set<string>([monthKey(new Date())]);
    receipts.forEach(r => set.add(r.date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [receipts]);

  const monthReceipts = useMemo(
    () => (showAll ? receipts.slice() : receipts.filter(r => r.date.slice(0, 7) === month))
      .sort((a, b) => {
        // Nog te controleren bonnen bovenaan, daarna nieuwste datum eerst.
        if (a.reviewed !== b.reviewed) return a.reviewed ? 1 : -1;
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      }),
    [receipts, month, showAll]
  );

  const toReview = useMemo(() => monthReceipts.filter(r => !r.reviewed).length, [monthReceipts]);

  async function approve(id: string) {
    await fetch(`/api/receipts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewed: true }),
    });
    setReceipts(rs => rs.map(r => (r.id === id ? { ...r, reviewed: true } : r)));
  }

  const [rescanId, setRescanId] = useState<string | null>(null);
  async function rescan(id: string) {
    setRescanId(id);
    try {
      const res = await fetch(`/api/receipts/${id}/rescan`, { method: "POST" });
      const d = await res.json() as { ok?: boolean; receipt?: Receipt; error?: string };
      if (d.ok && d.receipt) {
        setReceipts(rs => rs.map(r => (r.id === id ? d.receipt as Receipt : r)));
      } else {
        alert("Opnieuw scannen mislukt: " + (d.error || "onbekend"));
      }
    } finally { setRescanId(null); }
  }

  const totals = useMemo(() => {
    let zak = 0, priv = 0, onb = 0;
    for (const r of monthReceipts) {
      const c = r.amountCents ?? 0;
      if (r.kind === "zakelijk") zak += c;
      else if (r.kind === "prive") priv += c;
      else onb += c;
    }
    return { zak, priv, onb, total: zak + priv + onb };
  }, [monthReceipts]);

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(monthKey(d));
  }
  const [my, mm] = month.split("-").map(Number);
  const monthLabel = `${MONTHS_NL[mm - 1]} ${my}`;

  async function handleDelete(id: string) {
    if (!confirm("Deze bon verwijderen?")) return;
    await fetch(`/api/receipts/${id}`, { method: "DELETE" });
    setReceipts(rs => rs.filter(r => r.id !== id));
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-surface">
      {/* Kop: maand + totalen */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border bg-panel">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1">
            <button disabled={showAll} onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-full hover:bg-surface text-zinc-500 text-lg leading-none disabled:opacity-25">‹</button>
            <span className="text-sm font-bold text-zinc-800 min-w-[120px] text-center capitalize">{showAll ? "Alle bonnen" : monthLabel}</span>
            <button disabled={showAll} onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-full hover:bg-surface text-zinc-500 text-lg leading-none disabled:opacity-25">›</button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAll(v => !v)}
              className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all active:scale-95 ${showAll ? "bg-accent/15 text-accent" : "text-zinc-500 hover:bg-surface"}`}
            >{showAll ? "Per maand" : "Alles"}</button>
            <button
              onClick={() => setShowAdd(true)}
              className="px-3.5 py-1.5 text-xs font-bold rounded-full bg-gradient-to-br from-accent to-accent2 text-white shadow-soft active:scale-95"
            >+ Bon</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <TotalCard label="Zakelijk" value={eur(totals.zak)} accent="text-accent" />
          <TotalCard label="Privé" value={eur(totals.priv)} accent="text-emerald-600" />
          <TotalCard label="Totaal" value={eur(totals.total)} accent="text-zinc-800" />
        </div>
        {toReview > 0 && (
          <p className="mt-1.5 text-[11px] font-semibold text-amber-600">
            🧾 {toReview} {toReview === 1 ? "bon" : "bonnen"} te controleren — tik “bewerk” om type/omschrijving te zetten of “✓” als de AI het goed had.
          </p>
        )}
        {toReview === 0 && totals.onb > 0 && (
          <p className="mt-1.5 text-[11px] text-zinc-500">Nog {eur(totals.onb)} ongecategoriseerd (zet op zakelijk/privé).</p>
        )}
      </div>

      {/* Lijst */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading ? (
          <p className="text-center text-sm text-zinc-400 mt-8">Laden…</p>
        ) : monthReceipts.length === 0 ? (
          <div className="text-center mt-10 px-6">
            <p className="text-sm text-zinc-500">{showAll ? "Nog geen bonnen." : `Nog geen bonnen in ${monthLabel}.`}</p>
            <p className="text-xs text-zinc-400 mt-1">Voeg er een toe met “+ Bon”, of stuur er een vanaf je iPhone-Shortcut.</p>
          </div>
        ) : (
          monthReceipts.map(r => (
            <ReceiptRow key={r.id} r={r} onEdit={() => setEditing(r)} onDelete={() => handleDelete(r.id)} onApprove={() => approve(r.id)} onRescan={() => rescan(r.id)} rescanning={rescanId === r.id} />
          ))
        )}
      </div>

      {showAdd && (
        <ReceiptForm
          mode="add"
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
      {editing && (
        <ReceiptForm
          mode="edit"
          receipt={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function TotalCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-surface border border-border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-sm font-extrabold ${accent}`}>{value}</div>
    </div>
  );
}

function ReceiptRow({ r, onEdit, onDelete, onApprove, onRescan, rescanning }: { r: Receipt; onEdit: () => void; onDelete: () => void; onApprove: () => void; onRescan: () => void; rescanning: boolean }) {
  const [zoom, setZoom] = useState(false);
  return (
    <div className={`flex items-center gap-3 rounded-xl bg-panel border p-2.5 shadow-soft ${r.reviewed ? "border-border" : "border-amber-300 ring-1 ring-amber-200"}`}>
      {r.imageFile ? (
        <button onClick={() => setZoom(true)} className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/receipts/${r.id}/image`} alt="" className="w-12 h-12 rounded-lg object-cover bg-surface" />
        </button>
      ) : (
        <div className="shrink-0 w-12 h-12 rounded-lg bg-surface flex items-center justify-center text-zinc-300 text-lg">🧾</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-zinc-800 truncate">{r.merchant || r.description}</span>
          {r.aiAnalyzed && <span title="Door AI ingelezen" className="text-[10px]">✨</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {!r.reviewed && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Controleren</span>}
          {r.docType === "factuur" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">Factuur</span>}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${KIND_BADGE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
          {(r.docType === "factuur" || r.paymentStatus !== "onbekend") && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PAY_BADGE[r.paymentStatus]}`}>{PAY_LABEL[r.paymentStatus]}</span>
          )}
          {r.category && <span className="text-[10px] text-zinc-500 truncate">{r.category}</span>}
          <span className="text-[10px] text-zinc-400">· {r.date}</span>
          {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-[10px] text-accent hover:underline">✉︎ mail</a>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-extrabold text-zinc-800">{eur(r.amountCents)}</div>
        <div className="flex items-center gap-1.5 justify-end mt-0.5">
          {!r.reviewed && <button onClick={onApprove} title="AI klopt — markeer gecontroleerd" className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700">✓</button>}
          {r.imageFile && <button onClick={onRescan} disabled={rescanning} title="Foto opnieuw laten lezen met AI" className="text-[11px] text-zinc-400 hover:text-accent disabled:opacity-50">{rescanning ? "…" : "↻"}</button>}
          <button onClick={onEdit} className="text-[11px] text-zinc-400 hover:text-accent">bewerk</button>
          <button onClick={onDelete} className="text-[11px] text-zinc-400 hover:text-danger">wis</button>
        </div>
      </div>

      {zoom && r.imageFile && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setZoom(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/receipts/${r.id}/image`} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

function ReceiptForm({
  mode, receipt, onClose, onSaved,
}: {
  mode: "add" | "edit";
  receipt?: Receipt;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>(receipt?.docType ?? "bon");
  const [description, setDescription] = useState(receipt?.description ?? "");
  const [merchant, setMerchant] = useState(receipt?.merchant ?? "");
  const [kind, setKind] = useState<ReceiptKind>(receipt?.kind ?? "onbekend");
  const [amount, setAmount] = useState(receipt?.amountCents != null ? (receipt.amountCents / 100).toFixed(2).replace(".", ",") : "");
  const [date, setDate] = useState(receipt?.date ?? todayISO());
  const [category, setCategory] = useState(receipt?.category ?? "");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(receipt?.paymentStatus ?? "onbekend");
  const [note, setNote] = useState(receipt?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      if (mode === "add") {
        const fd = new FormData();
        if (file) fd.append("photo", file);
        fd.append("docType", docType);
        fd.append("description", description);
        fd.append("merchant", merchant);
        fd.append("kind", kind);
        fd.append("amount", amount);
        fd.append("date", date);
        fd.append("category", category);
        fd.append("paymentStatus", paymentStatus);
        fd.append("note", note);
        const res = await fetch("/api/receipts", { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json()).error || "Mislukt");
      } else if (receipt) {
        const res = await fetch(`/api/receipts/${receipt.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docType, description, merchant, kind, amount, date, category, paymentStatus, note }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Mislukt");
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Mislukt");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-panel rounded-t-2xl sm:rounded-2xl shadow-lift max-h-[92dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-bold text-zinc-800">{mode === "add" ? "Bon toevoegen" : "Bon bewerken"}</span>
          <button onClick={onClose} className="text-zinc-400 text-xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-3">
          {mode === "add" && (
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Foto van de bon</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-zinc-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-accent/10 file:text-accent file:font-semibold"
              />
              {file && <p className="mt-1 text-[11px] text-emerald-600">✨ Na opslaan leest de AI bedrag, winkel en datum automatisch in.</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Soort</label>
            <div className="flex gap-2">
              {(["bon", "factuur"] as const).map(d => (
                <button key={d} onClick={() => setDocType(d)}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all capitalize ${
                    docType === d ? "border-accent bg-accent/10 text-accent" : "border-border text-zinc-500"
                  }`}>{d === "bon" ? "Bon" : "Factuur"}</button>
              ))}
            </div>
          </div>

          <Field label="Omschrijving"><input value={description} onChange={e => setDescription(e.target.value)} placeholder="bv. Lunch met klant" className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bedrag (€)"><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="12,50" className={inputCls} /></Field>
            <Field label="Datum"><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Winkel / leverancier"><input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="bv. Albert Heijn" className={inputCls} /></Field>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Type</label>
            <div className="flex gap-2">
              {(["zakelijk", "prive"] as const).map(k => (
                <button key={k} onClick={() => setKind(k)}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                    kind === k ? "border-accent bg-accent/10 text-accent" : "border-border text-zinc-500"
                  }`}>{KIND_LABEL[k]}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Betaalstatus{docType === "factuur" ? "" : " (optioneel)"}</label>
            <div className="flex gap-2">
              {(["betaald", "openstaand", "onbekend"] as const).map(p => (
                <button key={p} onClick={() => setPaymentStatus(p)}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                    paymentStatus === p ? "border-accent bg-accent/10 text-accent" : "border-border text-zinc-500"
                  }`}>{PAY_LABEL[p]}</button>
              ))}
            </div>
          </div>

          <Field label="Categorie (optioneel)"><input value={category} onChange={e => setCategory(e.target.value)} placeholder="bv. Boodschappen" className={inputCls} /></Field>
          <Field label="Notitie (optioneel)"><input value={note} onChange={e => setNote(e.target.value)} className={inputCls} /></Field>

          {err && <p className="text-xs text-danger">{err}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-2.5 text-sm font-bold rounded-xl bg-gradient-to-br from-accent to-accent2 text-white shadow-soft active:scale-95 disabled:opacity-60"
          >{busy ? (mode === "add" && file ? "Bon analyseren met AI…" : "Opslaan…") : "Opslaan"}</button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface focus:outline-none focus:border-accent text-zinc-800";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
