"use client";

import { useEffect, useState } from "react";
import type { WeeklyReview } from "@/lib/mentorTypes";

interface Props {
  onClose: () => void;
}

export default function WeeklyReviewModal({ onClose }: Props) {
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weekly-review")
      .then(r => r.json())
      .then((j: { review: WeeklyReview | null }) => setReview(j.review))
      .catch(() => setReview(null))
      .finally(() => setLoading(false));
  }, []);

  const m = review?.metrics;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">📊 Weekanalyse</h2>
            <p className="text-[11px] text-zinc-600">
              {review ? `${review.weekStart} – ${review.weekEnd}` : "Automatisch elke maandag"}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-zinc-600 py-6 text-center">Laden…</p>
          ) : !review ? (
            <p className="text-sm text-zinc-600 py-6 text-center">
              Nog geen weekanalyse. De maandag-routine vult deze automatisch op basis van je taakdata.
            </p>
          ) : (
            <>
              {/* Samenvatting */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-zinc-800 leading-relaxed">
                {review.summary}
              </div>

              {/* Metrics */}
              {m && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "Afgerond", value: m.completed },
                    { label: "Nieuw", value: m.created },
                    { label: "Te laat", value: m.overdue },
                    { label: "Open P0/P1", value: (m.openP0 ?? 0) + (m.openP1 ?? 0) },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl bg-gray-100 px-3 py-2 text-center">
                      <div className="text-lg font-semibold text-zinc-900">{s.value ?? 0}</div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Focus deze week */}
              {review.focusNextWeek && review.focusNextWeek.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-900 mb-1.5">Focus deze week</h3>
                  <ul className="space-y-1">
                    {review.focusNextWeek.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm text-zinc-700">
                        <span className="text-blue-600">→</span><span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Highlights */}
              {review.highlights && review.highlights.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-900 mb-1.5">Opvallend vorige week</h3>
                  <ul className="space-y-1">
                    {review.highlights.map((h, i) => (
                      <li key={i} className="flex gap-2 text-sm text-zinc-700">
                        <span className="text-zinc-400">•</span><span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[10px] text-zinc-500 pt-1">
                Gegenereerd {new Date(review.generatedAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}
                {review.source ? ` · ${review.source}` : ""}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
