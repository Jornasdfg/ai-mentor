"use client";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";

interface GoogleEvent {
  id: string; title: string; start: string; end: string;
  allDay: boolean; source: "google_calendar"; calendarId: string;
}
interface Props {
  monthBase: string;
  blocks: ScheduleBlock[];
  googleEvents: GoogleEvent[];
  tasks: MentorTask[];
  onDayClick: (dayISO: string) => void;
}

const DAY_NL = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const COLOR_BG: Record<string, string> = {
  green: "bg-emerald-900/60 text-emerald-700",
  orange: "bg-amber-900/60 text-amber-700",
  red: "bg-red-900/60 text-red-600",
  gray: "bg-white text-zinc-700",
};
const DOT: Record<string, string> = {
  green: "bg-emerald-400", orange: "bg-amber-400",
  red: "bg-red-400", gray: "bg-gray-400",
};

function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function getMonthDays(base: string): Array<{ iso: string; inMonth: boolean }> {
  const [y, m] = base.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);
  let startDow = firstDay.getDay();
  if (startDow === 0) startDow = 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - (startDow - 1));
  let endDow = lastDay.getDay();
  if (endDow === 0) endDow = 7;
  const end = new Date(lastDay);
  end.setDate(lastDay.getDate() + (7 - endDow));
  const days: Array<{ iso: string; inMonth: boolean }> = [];
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    days.push({ iso, inMonth: cur.getMonth() === m - 1 });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export default function MonthView({ monthBase, blocks, googleEvents, tasks: _tasks, onDayClick }: Props) {
  const days = getMonthDays(monthBase);
  const today = todayISO();
  const weeks = Math.ceil(days.length / 7);

  return (
    <div className="flex flex-col h-full bg-gray-100 overflow-hidden">
      <div className="grid grid-cols-7 shrink-0 border-b border-gray-200">
        {DAY_NL.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{d}</div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${weeks}, minmax(90px, 1fr))` }}>
          {days.map(({ iso, inMonth }) => {
            const isToday = iso === today;
            const dayBlocks = blocks.filter(b => b.start.startsWith(iso));
            // Meerdaagse/hele-dag events die DEZE dag bedekken → doorlopende rode balk.
            const allDayCover = googleEvents.filter(e => e.allDay && e.start.slice(0, 10) <= iso && iso <= e.end.slice(0, 10));
            const timedToday = googleEvents.filter(e => !e.allDay && e.start.startsWith(iso));
            const total = dayBlocks.length + timedToday.length;
            const dayNum = parseInt(iso.slice(8), 10);
            const [Y, M, D] = iso.split("-").map(Number);
            const wd = new Date(Date.UTC(Y, M - 1, D)).getUTCDay(); // 0=zo
            const isWeekStart = wd === 1; // maandag → titel opnieuw tonen
            return (
              <div
                key={iso}
                onClick={() => onDayClick(iso)}
                className={`border-b border-r border-gray-200 p-1.5 cursor-pointer hover:bg-gray-100/70 transition-colors min-h-[90px] ${!inMonth ? "opacity-25" : ""} ${isToday ? "bg-blue-950/20" : ""}`}
              >
                <div className={`text-xs font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-blue-500 text-white" : "text-zinc-600"}`}>
                  {dayNum}
                </div>
                {/* Doorlopende balk voor meerdaagse/hele-dag events (vakantie e.d.) */}
                <div className="space-y-0.5 mb-0.5">
                  {allDayCover.map(e => {
                    const showTitle = e.start.slice(0, 10) === iso || isWeekStart;
                    return (
                      <div key={e.id} className="-mx-1.5 px-1.5 py-0.5 text-[10px] text-white bg-red-500 truncate font-semibold" title={e.title}>
                        {showTitle ? e.title : " "}
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-0.5">
                  {dayBlocks.slice(0, 2).map(b => (
                    <div key={b.id} className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate ${COLOR_BG[b.colorState] ?? COLOR_BG.gray}`} title={b.title}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[b.colorState] ?? DOT.gray}`} />
                      <span className="truncate">{b.start.slice(11, 16)} {b.title}</span>
                    </div>
                  ))}
                  {timedToday.slice(0, Math.max(0, 2 - dayBlocks.length)).map(e => (
                    <div key={e.id} className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] bg-indigo-900/40 text-indigo-300 truncate" title={e.title}>
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                      <span className="truncate">{e.start.slice(11, 16)} {e.title}</span>
                    </div>
                  ))}
                  {total > 2 && <div className="text-[10px] text-zinc-600 px-1">+{total - 2} meer</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
