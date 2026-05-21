"use client";
import { useEffect, useRef } from "react";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";
import ScheduleBlockCard from "./ScheduleBlockCard";
import GoogleEventBlock from "./GoogleEventBlock";

export interface GoogleEvent {
  id: string; title: string; start: string; end: string;
  allDay: boolean; source: "google_calendar"; calendarId: string;
  description?: string | null; htmlLink?: string | null;
}
interface Props {
  weekDays: string[];
  blocks: ScheduleBlock[];
  googleEvents: GoogleEvent[];
  tasks: MentorTask[];
  onDropTask: (taskId: string, start: string, end: string, durationMins: number) => Promise<void>;
  onMoveBlock: (blockId: string, start: string, end: string) => Promise<void>;
  onClickBlock?: (block: ScheduleBlock, task?: MentorTask) => void;
  onClickGoogleEvent?: (event: GoogleEvent) => void;
  startHour?: number;
  endHour?: number;
}

const HOUR_H = 64;
const DAY_NL = ["zo","ma","di","wo","do","vr","za"];
const MONTH_NL = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];

function labelDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return { wd: DAY_NL[d.getUTCDay()], day: d.getUTCDate(), month: MONTH_NL[d.getUTCMonth()] };
}

// Convert an ISO datetime (possibly with offset like +02:00) to Y position in the grid
// Uses proper Date parsing to respect timezone offset
function dtToY(dt: string, startHour: number): number {
  if (!dt || !dt.includes("T")) return 0;
  const d = new Date(dt);
  const h = d.toLocaleString("nl-NL", { hour: "numeric", hour12: false, timeZone: "Europe/Amsterdam" });
  const m = d.toLocaleString("nl-NL", { minute: "numeric", timeZone: "Europe/Amsterdam" });
  const hNum = parseInt(h, 10);
  const mNum = parseInt(m, 10);
  return Math.max(0, (hNum - startHour) * HOUR_H + (mNum / 60) * HOUR_H);
}

function minsToH(mins: number): number {
  return (mins / 60) * HOUR_H;
}

function yToDateTime(y: number, dayISO: string, startHour: number): string {
  const totalMins = Math.max(0, (y / HOUR_H) * 60);
  const snapped = Math.round(totalMins / 15) * 15;
  const absMin = startHour * 60 + snapped;
  const h = Math.min(23, Math.floor(absMin / 60));
  const m = absMin % 60;
  return `${dayISO}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`;
}

export default function WeekTimeGrid({
  weekDays, blocks, googleEvents, tasks,
  onDropTask, onMoveBlock, onClickBlock, onClickGoogleEvent,
  startHour = 7, endHour = 22,
}: Props) {
  const totalHours = endHour - startHour;
  const gridH = totalHours * HOUR_H;
  const scrollRef = useRef<HTMLDivElement>(null);
  const isToday = (iso: string) => iso === new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const h = now.toLocaleString("nl-NL", { hour: "numeric", hour12: false, timeZone: "Europe/Amsterdam" });
    const nowH = parseInt(h, 10) + now.getMinutes() / 60;
    const y = Math.max(0, (nowH - startHour - 1) * HOUR_H);
    scrollRef.current.scrollTop = y;
  }, [startHour]);

  function currentTimeY(): number {
    const now = new Date();
    const h = now.toLocaleString("nl-NL", { hour: "numeric", hour12: false, timeZone: "Europe/Amsterdam" });
    const nowH = parseInt(h, 10) + now.getMinutes() / 60;
    return (nowH - startHour) * HOUR_H;
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, dayISO: string) {
    e.preventDefault();
    e.stopPropagation();
    const type = e.dataTransfer.getData("dnd-type");
    const id = e.dataTransfer.getData("dnd-id");
    const duration = parseInt(e.dataTransfer.getData("dnd-duration") || "60", 10);
    if (!id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const start = yToDateTime(y, dayISO, startHour);
    const endD = new Date(start);
    endD.setMinutes(endD.getMinutes() + duration);
    const end = `${dayISO}T${String(endD.getHours()).padStart(2,"0")}:${String(endD.getMinutes()).padStart(2,"0")}:00`;

    if (type === "task") {
      onDropTask(id, start, end, duration);
    } else if (type === "block") {
      onMoveBlock(id, start, end);
    }
  }

  const hourLabels = Array.from({ length: totalHours }, (_, i) => startHour + i);
  const nowY = currentTimeY();
  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* Day header row */}
      <div className="flex shrink-0 border-b border-zinc-800">
        <div className="w-12 shrink-0" />
        {weekDays.map(iso => {
          const { wd, day, month } = labelDay(iso);
          const today = isToday(iso);
          return (
            <div key={iso} className={`flex-1 py-2 text-center border-l border-zinc-800 ${today ? "bg-blue-950/30" : ""}`}>
              <div className={`text-xs uppercase tracking-wide ${today ? "text-blue-400" : "text-zinc-500"}`}>{wd}</div>
              <div className={`text-sm font-semibold ${today ? "text-blue-300" : "text-zinc-200"}`}>
                {today ? (
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs">{day}</span>
                ) : day}
              </div>
              <div className="text-[10px] text-zinc-600">{month}</div>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid body */}
      <div ref={scrollRef} className="flex flex-1 overflow-y-auto overflow-x-hidden">
        {/* Time axis */}
        <div className="w-12 shrink-0 relative" style={{ height: gridH }}>
          {hourLabels.map(h => (
            <div
              key={h}
              className="absolute right-2 text-[10px] text-zinc-600 select-none"
              style={{ top: (h - startHour) * HOUR_H - 7 }}
            >
              {String(h).padStart(2,"0")}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map(dayISO => {
          const dayBlocks = blocks.filter(b => b.start.startsWith(dayISO));
          const dayEvents = googleEvents.filter(e => {
            const eDay = e.allDay ? e.start.slice(0, 10) : new Date(e.start).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
            return eDay === dayISO;
          });
          const today = isToday(dayISO);
          return (
            <div
              key={dayISO}
              className={`flex-1 relative border-l border-zinc-800 ${today ? "bg-blue-950/10" : ""}`}
              style={{ height: gridH }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, dayISO)}
            >
              {/* Hour lines */}
              {hourLabels.map(h => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-zinc-800/60 pointer-events-none"
                  style={{ top: (h - startHour) * HOUR_H }}
                />
              ))}
              {/* Half-hour lines */}
              {hourLabels.map(h => (
                <div
                  key={`${h}h`}
                  className="absolute left-0 right-0 border-t border-zinc-800/30 pointer-events-none"
                  style={{ top: (h - startHour) * HOUR_H + HOUR_H / 2 }}
                />
              ))}

              {/* Current time line */}
              {today && nowY > 0 && nowY < gridH && (
                <div
                  className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
                  style={{ top: nowY }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                  <div className="flex-1 border-t border-red-500" />
                </div>
              )}

              {/* Google events */}
              {dayEvents.map(ev => {
                const top = ev.allDay ? 0 : dtToY(ev.start, startHour);
                const durationMins = ev.allDay
                  ? totalHours * 60
                  : Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000);
                const h = Math.max(20, minsToH(durationMins));
                return (
                  <div key={ev.id} className="absolute left-0.5 right-0.5 z-[1]" style={{ top, height: h }}>
                    <GoogleEventBlock
                      event={ev}
                      heightPx={h}
                      onClick={onClickGoogleEvent ? () => onClickGoogleEvent(ev) : undefined}
                    />
                  </div>
                );
              })}

              {/* Schedule blocks */}
              {dayBlocks.map(block => {
                const top = dtToY(block.start, startHour);
                const h = Math.max(22, minsToH(block.durationMinutes));
                const task = tasks.find(t => t.id === block.taskId);
                return (
                  <div key={block.id} className="absolute left-0.5 right-0.5 z-[2]" style={{ top, height: h }}>
                    <ScheduleBlockCard
                      block={block}
                      task={task}
                      heightPx={h}
                      onClick={onClickBlock ? () => onClickBlock(block, task) : undefined}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
