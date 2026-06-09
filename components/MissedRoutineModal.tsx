"use client";

export interface MissedItem {
  id: string;
  title: string;
  missedDate: string; // YYYY-MM-DD
}

interface Props {
  items: MissedItem[];
  busyId: string | null;
  onPlanToday: (id: string) => void;
  onSkip: (id: string) => void;
  onClose: () => void;
}

const NL_DAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const NL_MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}
function missedLabel(missed: string): string {
  const t = new Date(`${todayISO()}T12:00:00Z`).getTime();
  const m = new Date(`${missed}T12:00:00Z`).getTime();
  const diff = Math.round((t - m) / 86400000);
  if (diff <= 1) return "Gisteren niet gedaan";
  if (diff === 2) return "Eergisteren niet gedaan";
  const d = new Date(`${missed}T12:00:00Z`);
  return `Op ${NL_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${NL_MONTHS[d.getUTCMonth()]} niet gedaan`;
}

export default function MissedRoutineModal({ items, busyId, onPlanToday, onSkip, onClose }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div
        className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-lift animate-pop-in overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-accent/10 to-accent2/10 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔁</span>
            <h2 className="text-sm font-extrabold text-zinc-900">Blijven liggen</h2>
          </div>
          <p className="text-[12px] text-zinc-600 mt-0.5">Plan het vandaag in of sla deze keer over.</p>
        </div>

        <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
          {items.map(item => (
            <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-sm font-semibold text-zinc-900 leading-snug break-anywhere">{item.title}</p>
              <p className="text-[11px] text-amber-700 mt-0.5">{missedLabel(item.missedDate)}</p>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={() => onPlanToday(item.id)}
                  disabled={busyId === item.id}
                  className="flex-1 py-2 text-xs font-bold rounded-full bg-gradient-to-br from-accent to-accent2 text-white shadow-soft active:scale-95 disabled:opacity-50 transition-all"
                >
                  📅 Vandaag plannen
                </button>
                <button
                  onClick={() => onSkip(item.id)}
                  disabled={busyId === item.id}
                  className="px-3 py-2 text-xs font-semibold rounded-full border border-gray-200 text-zinc-600 hover:text-zinc-800 hover:border-gray-300 active:scale-95 disabled:opacity-50 transition-all"
                >
                  Overslaan
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
          <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-700 transition-colors">Later</button>
        </div>
      </div>
    </div>
  );
}
