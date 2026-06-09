"use client";

import { useEffect, useState } from "react";
import InstagramUploadModal from "./InstagramUploadModal";

function amsToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=zo..6=za
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

// Pop-up op maandag (of dinsdag als nog niet gedaan) om de Instagram-week te uploaden.
export default function InstagramWeekPrompt() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const today = amsToday();
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    if (dow !== 1 && dow !== 2) return;                 // alleen ma/di
    const monday = mondayOf(today);
    if (typeof localStorage !== "undefined" && localStorage.getItem(`ig-skip-${monday}`)) return;
    fetch("/api/weekly-review")
      .then(r => r.json())
      .then((j: { review: { funnel?: { uploadedAt?: string } | null } | null }) => {
        const up = j.review?.funnel?.uploadedAt;
        const doneThisWeek = !!up && up.slice(0, 10) >= monday;
        if (!doneThisWeek) setShow(true);
      })
      .catch(() => {});
  }, []);

  function skipWeek() {
    const monday = mondayOf(amsToday());
    try { localStorage.setItem(`ig-skip-${monday}`, "1"); } catch { /* ignore */ }
    setShow(false);
  }

  if (open) {
    return <InstagramUploadModal onClose={() => { setOpen(false); setShow(false); }} />;
  }
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[60] p-4" onClick={() => setShow(false)}>
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm shadow-lift animate-pop-in overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-accent/10 to-accent2/10 border-b border-gray-200">
          <div className="flex items-center gap-2"><span className="text-xl">📸</span><h2 className="text-sm font-extrabold text-zinc-900">Instagram-weekanalyse</h2></div>
          <p className="text-[12px] text-zinc-600 mt-0.5">Upload je posts/reels- en stories-export van vorige week. Zo zie je wat je volgers zagen → link-in-bio → affiliate.</p>
        </div>
        <div className="p-4 flex gap-2">
          <button
            onClick={() => { setOpen(true); }}
            className="flex-1 py-2.5 text-sm font-bold rounded-full bg-gradient-to-br from-accent to-accent2 text-white shadow-soft active:scale-95 transition-all"
          >
            Start
          </button>
          <button
            onClick={skipWeek}
            className="px-4 py-2.5 text-sm font-semibold rounded-full border border-gray-200 text-zinc-600 hover:text-zinc-800 hover:border-gray-300 active:scale-95 transition-all"
          >
            Overslaan
          </button>
        </div>
        <div className="px-5 pb-3 -mt-1 flex justify-end">
          <button onClick={() => setShow(false)} className="text-[11px] text-zinc-400 hover:text-zinc-600">Later</button>
        </div>
      </div>
    </div>
  );
}
