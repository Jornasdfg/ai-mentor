"use client";

import { useEffect, useRef, useState } from "react";
import type { InstagramSummary } from "@/lib/instagram/parseMetaCsv";

interface Funnel {
  instagramReach: number;
  instagramViews: number;
  storyLinkClicks: number;
  linkinbioClicks?: number | null;
  affiliateRevenueEur?: number | null;
  uploadedAt: string;
}

interface Props {
  onClose: () => void;
  onUploaded?: () => void;
}

const nf = new Intl.NumberFormat("nl-NL");
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : nf.format(n));
const pct = (a?: number | null, b?: number | null) =>
  a && b && b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—";

export default function InstagramUploadModal({ onClose, onUploaded }: Props) {
  const [postFile, setPostFile] = useState<File | null>(null);
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ig, setIg] = useState<InstagramSummary | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const postRef = useRef<HTMLInputElement>(null);
  const storyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/weekly-review")
      .then(r => r.json())
      .then((j: { review: { instagram?: InstagramSummary | null; funnel?: Funnel | null } | null }) => {
        if (j.review?.instagram) setIg(j.review.instagram);
        if (j.review?.funnel) setFunnel(j.review.funnel);
      })
      .catch(() => {});
  }, []);

  async function upload() {
    if (!postFile && !storyFile) { setError("Kies minstens één CSV (posts/reels of stories)."); return; }
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      if (postFile) fd.append("postCsv", postFile);
      if (storyFile) fd.append("storyCsv", storyFile);
      const res = await fetch("/api/weekly-review/instagram", { method: "POST", body: fd });
      const data = await res.json() as { instagram?: InstagramSummary; funnel?: Funnel; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload mislukt");
      setIg(data.instagram ?? null);
      setFunnel(data.funnel ?? null);
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout");
    } finally {
      setUploading(false);
    }
  }

  function FileRow({ label, hint, file, onPick, inputRef }: {
    label: string; hint: string; file: File | null;
    onPick: (f: File | null) => void; inputRef: React.RefObject<HTMLInputElement | null>;
  }) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold text-zinc-900">{label}</p>
        <p className="text-[11px] text-zinc-500 mb-2">{hint}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => onPick(e.target.files?.[0] ?? null)}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-gray-200 text-zinc-700 hover:border-accent/40 hover:text-accent active:scale-95 transition-all"
          >
            {file ? "Ander bestand" : "Kies CSV"}
          </button>
          <span className="text-[11px] text-zinc-600 truncate min-w-0">{file ? file.name : "Geen gekozen"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-lift animate-pop-in" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-br from-accent/10 to-accent2/10 border-b border-gray-200 px-5 py-3.5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-zinc-900">📸 Instagram-weekanalyse</h2>
            <p className="text-[11px] text-zinc-600">Upload je Meta Business Suite-exports van deze week.</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800 text-xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-3">
          {error && <div className="px-3 py-2 text-xs text-red-600 border border-red-500/30 rounded-lg bg-red-500/5">{error}</div>}

          <FileRow
            label="Posts & Reels (CSV)"
            hint="Business Suite → Content → exporteer berichten/reels."
            file={postFile} onPick={setPostFile} inputRef={postRef}
          />
          <FileRow
            label="Stories (CSV)"
            hint="Business Suite → Content → exporteer verhalen."
            file={storyFile} onPick={setStoryFile} inputRef={storyRef}
          />

          <button
            onClick={upload}
            disabled={uploading || (!postFile && !storyFile)}
            className="w-full py-2.5 text-sm font-bold rounded-full bg-gradient-to-br from-accent to-accent2 text-white shadow-soft active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {uploading ? "Analyseren…" : "Uploaden & analyseren"}
          </button>

          {ig && (
            <div className="space-y-3 pt-1">
              {/* Funnel */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-[11px] font-bold text-zinc-700 uppercase tracking-wide">Funnel deze week</div>
                <div className="divide-y divide-gray-100">
                  <FunnelStep emoji="👀" label="Gezien op Instagram" main={`${fmt(ig.totals.reach)} bereik`} sub={`${fmt(ig.totals.views)} weergaven`} />
                  <FunnelStep
                    emoji="➡️" label="Naar link-in-bio"
                    main={`${fmt((funnel?.storyLinkClicks ?? ig.stories.linkClicks) + (funnel?.linkinbioClicks ?? 0))} clicks`}
                    sub={`stories: ${fmt(ig.stories.linkClicks)} · link-in-bio: ${fmt(funnel?.linkinbioClicks)} · ${pct(funnel?.linkinbioClicks ?? ig.stories.linkClicks, ig.totals.reach)} van bereik`}
                  />
                  <FunnelStep
                    emoji="💶" label="Affiliate-inkomsten"
                    main={funnel?.affiliateRevenueEur != null ? `€ ${nf.format(funnel.affiliateRevenueEur)}` : "—"}
                    sub={funnel?.affiliateRevenueEur != null ? `${pct(funnel.affiliateRevenueEur, funnel?.linkinbioClicks)} per click` : "komt uit de affiliate-routine"}
                  />
                </div>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Posts/Reels" value={`${ig.posts.count}`} sub={`${fmt(ig.posts.reach)} bereik`} />
                <Stat label="Stories" value={`${ig.stories.count}`} sub={`${fmt(ig.stories.reach)} bereik`} />
                <Stat label="Nieuwe volgers" value={fmt(ig.totals.follows)} sub="via content" />
                <Stat label="Interacties" value={fmt(ig.totals.engagement)} sub="likes+reacties+saves+shares" />
              </div>

              {/* Top content */}
              {ig.top.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-900 mb-1.5">Best bekeken</h3>
                  <ul className="space-y-1">
                    {ig.top.slice(0, 4).map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-[12px] text-zinc-700">
                        <span className="text-zinc-400 shrink-0">{i + 1}.</span>
                        <span className="truncate min-w-0">{t.description || t.type}</span>
                        <span className="ml-auto shrink-0 text-zinc-500">{fmt(t.reach)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {funnel?.uploadedAt && (
                <p className="text-[10px] text-zinc-400">Geüpload {new Date(funnel.uploadedAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelStep({ emoji, label, main, sub }: { emoji: string; label: string; main: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="text-lg shrink-0">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-zinc-500">{label}</p>
        <p className="text-sm font-bold text-zinc-900">{main}</p>
      </div>
      <p className="text-[10px] text-zinc-500 text-right max-w-[55%] break-anywhere">{sub}</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-gray-100 px-3 py-2">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="text-base font-bold text-zinc-900">{value}</div>
      <div className="text-[10px] text-zinc-500">{sub}</div>
    </div>
  );
}
