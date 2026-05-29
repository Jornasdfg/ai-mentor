"use client";
import { useEffect, useRef, useState, useCallback } from "react";
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
  onCreateTask?: (title: string, start: string, end: string) => Promise<void>;
  onConfirmBlock?: (blockId: string) => void;
  startHour?: number;
  endHour?: number;
}

const HOUR_H = 72; // slightly taller rows for touch
const SNAP_MINS = 15;
const DEFAULT_DURATION_MINS = 60;
const DAY_NL = ["zo","ma","di","wo","do","vr","za"];
const MONTH_NL = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];

function labelDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return { wd: DAY_NL[d.getUTCDay()], day: d.getUTCDate(), month: MONTH_NL[d.getUTCMonth()] };
}

function dtToY(dt: string, startHour: number): number {
  if (!dt || !dt.includes("T")) return 0;
  const d = new Date(dt);
  const h = d.toLocaleString("nl-NL", { hour: "numeric", hour12: false, timeZone: "Europe/Amsterdam" });
  const m = d.toLocaleString("nl-NL", { minute: "numeric", timeZone: "Europe/Amsterdam" });
  return Math.max(0, (parseInt(h, 10) - startHour) * HOUR_H + (parseInt(m, 10) / 60) * HOUR_H);
}

function minsToH(mins: number): number {
  return (mins / 60) * HOUR_H;
}

function yToDateTime(y: number, dayISO: string, startHour: number): string {
  const totalMins = Math.max(0, (y / HOUR_H) * 60);
  const snapped = Math.round(totalMins / SNAP_MINS) * SNAP_MINS;
  const absMin = startHour * 60 + snapped;
  const h = Math.min(23, Math.floor(absMin / 60));
  const m = absMin % 60;
  return `${dayISO}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`;
}

function snapY(y: number): number {
  const step = HOUR_H / (60 / SNAP_MINS);
  return Math.round(y / step) * step;
}

function addMinsToTimeStr(timeStr: string, deltaMins: number): string {
  const [datePart, timePart] = timeStr.split("T");
  const [h, m] = timePart.split(":").map(Number);
  const total = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + deltaMins));
  return `${datePart}T${String(Math.floor(total / 60)).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}:00`;
}

interface QuickCreate {
  dayISO: string;
  top: number;
  start: string;
  end: string;
}

export default function WeekTimeGrid({
  weekDays, blocks, googleEvents, tasks,
  onDropTask, onMoveBlock, onClickBlock, onClickGoogleEvent, onCreateTask, onConfirmBlock,
  startHour = 7, endHour = 22,
}: Props) {
  const totalHours = endHour - startHour;
  const gridH = totalHours * HOUR_H;
  const scrollRef = useRef<HTMLDivElement>(null);
  const isToday = (iso: string) => iso === new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

  // Drop indicator state
  const [dragOver, setDragOver] = useState<{ dayISO: string; y: number } | null>(null);
  const dragLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resize state
  const [resizeDelta, setResizeDelta] = useState<{ blockId: string; deltaPx: number } | null>(null);

  // Quick create state
  const [quickCreate, setQuickCreate] = useState<QuickCreate | null>(null);
  const [qcTitle, setQcTitle] = useState("");
  const [qcSubmitting, setQcSubmitting] = useState(false);

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

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, dayISO: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragLeaveTimerRef.current) clearTimeout(dragLeaveTimerRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    const y = snapY(e.clientY - rect.top);
    setDragOver({ dayISO, y });
  }

  function handleDragLeave() {
    dragLeaveTimerRef.current = setTimeout(() => setDragOver(null), 80);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, dayISO: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const type = e.dataTransfer.getData("dnd-type");
    const id = e.dataTransfer.getData("dnd-id");
    const duration = parseInt(e.dataTransfer.getData("dnd-duration") || "60", 10);
    if (!id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const start = yToDateTime(y, dayISO, startHour);
    const end = addMinsToTimeStr(start, duration);

    if (type === "task") {
      onDropTask(id, start, end, duration);
    } else if (type === "block") {
      onMoveBlock(id, start, end);
    }
  }

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, dayISO: string) {
    if (!onCreateTask) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rawY = e.clientY - rect.top;
    const snappedY = snapY(rawY);
    const start = yToDateTime(snappedY, dayISO, startHour);
    const end = addMinsToTimeStr(start, DEFAULT_DURATION_MINS);
    setQuickCreate({ dayISO, top: snappedY, start, end });
    setQcTitle("");
  }

  async function handleQcSubmit() {
    if (!quickCreate || !qcTitle.trim() || !onCreateTask || qcSubmitting) return;
    setQcSubmitting(true);
    const { start, end } = quickCreate;
    setQuickCreate(null);
    try {
      await onCreateTask(qcTitle.trim(), start, end);
    } finally {
      setQcSubmitting(false);
    }
  }

  function closeQuickCreate() {
    setQuickCreate(null);
    setQcTitle("");
  }

  const handleResizeStart = useCallback((block: ScheduleBlock, e: React.MouseEvent, origHeight: number) => {
    e.preventDefault();
    e.stopPropagation();

    const startClientY = e.clientY;

    function onMove(me: MouseEvent) {
      const raw = me.clientY - startClientY;
      const step = HOUR_H / (60 / SNAP_MINS);
      const snapped = Math.round(raw / step) * step;
      setResizeDelta({ blockId: block.id, deltaPx: snapped });
    }

    function onUp(me: MouseEvent) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);

      const raw = me.clientY - startClientY;
      const deltaMins = Math.round((raw / HOUR_H) * 60 / SNAP_MINS) * SNAP_MINS;
      if (Math.abs(deltaMins) >= SNAP_MINS) {
        const newEnd = addMinsToTimeStr(block.end, deltaMins);
        onMoveBlock(block.id, block.start, newEnd);
      }
      setResizeDelta(null);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [onMoveBlock]);

  const hourLabels = Array.from({ length: totalHours }, (_, i) => startHour + i);
  const nowY = currentTimeY();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* Day header row */}
      <div className="flex shrink-0 border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="w-10 sm:w-12 shrink-0" />
        {weekDays.map(iso => {
          const { wd, day, month } = labelDay(iso);
          const today = isToday(iso);
          return (
            <div key={iso} className={`flex-1 py-2 text-center border-l border-zinc-800 ${today ? "bg-blue-950/30" : ""}`}>
              <div className={`text-[10px] sm:text-xs uppercase tracking-wide ${today ? "text-blue-400" : "text-zinc-500"}`}>{wd}</div>
              <div className={`text-sm sm:text-sm font-semibold ${today ? "text-blue-300" : "text-zinc-200"}`}>
                {today ? (
                  <span className="inline-flex items-center justify-center w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-blue-500 text-white text-xs">{day}</span>
                ) : day}
              </div>
              <div className="text-[10px] text-zinc-600 hidden sm:block">{month}</div>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid body */}
      <div ref={scrollRef} className="flex flex-1 overflow-y-auto overflow-x-hidden">
        {/* Time axis */}
        <div className="w-10 sm:w-12 shrink-0 relative" style={{ height: gridH }}>
          {hourLabels.map(h => (
            <div
              key={h}
              className="absolute right-1 sm:right-2 text-[10px] text-zinc-600 select-none"
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
          const dropY = dragOver?.dayISO === dayISO ? dragOver.y : null;
          return (
            <div
              key={dayISO}
              className={`flex-1 relative border-l border-zinc-800 ${today ? "bg-blue-950/10" : ""} ${onCreateTask ? "cursor-cell" : ""}`}
              style={{ height: gridH }}
              onDragOver={(e) => handleDragOver(e, dayISO)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, dayISO)}
              onClick={(e) => handleColumnClick(e, dayISO)}
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

              {/* Drop indicator */}
              {dropY !== null && (
                <div
                  className="absolute left-0 right-0 pointer-events-none z-30"
                  style={{ top: dropY }}
                >
                  <div className="relative">
                    <div className="absolute -left-1 -top-1.5 flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
                    </div>
                    <div className="border-t-2 border-blue-400 border-dashed ml-1" />
                    <div className="absolute left-3 -top-4 bg-blue-600 text-white text-[9px] font-mono px-1 py-0.5 rounded leading-none whitespace-nowrap">
                      {yToDateTime(dropY, dayISO, startHour).slice(11, 16)}
                    </div>
                  </div>
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
                  <div key={ev.id} className="absolute left-0.5 right-0.5 z-[1]" style={{ top, height: h }}
                    onClick={(e) => { e.stopPropagation(); closeQuickCreate(); }}>
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
                const baseH = Math.max(22, minsToH(block.durationMinutes));
                const h = resizeDelta?.blockId === block.id
                  ? Math.max(22, baseH + resizeDelta.deltaPx)
                  : baseH;
                const task = tasks.find(t => t.id === block.taskId);
                return (
                  <div key={block.id} className="absolute left-0.5 right-0.5 z-[2]" style={{ top, height: h }}
                    onClick={(e) => { e.stopPropagation(); closeQuickCreate(); }}>
                    <ScheduleBlockCard
                      block={block}
                      task={task}
                      heightPx={h}
                      onClick={onClickBlock ? () => onClickBlock(block, task) : undefined}
                      onResizeStart={(e) => handleResizeStart(block, e, baseH)}
                      onConfirm={onConfirmBlock ? () => onConfirmBlock(block.id) : undefined}
                    />
                  </div>
                );
              })}

              {/* Quick-create inline form */}
              {quickCreate?.dayISO === dayISO && (
                <div
                  className="absolute left-0.5 right-0.5 z-40 rounded-md overflow-hidden shadow-xl"
                  style={{ top: quickCreate.top, minHeight: 58 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="bg-zinc-800 border border-blue-500/70 rounded-md">
                    <div className="flex items-center gap-1.5 px-2 pt-2 pb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mt-0.5" />
                      <input
                        autoFocus
                        value={qcTitle}
                        onChange={(e) => setQcTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleQcSubmit(); }
                          if (e.key === "Escape") closeQuickCreate();
                        }}
                        placeholder="Nieuwe taak…"
                        className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
                        disabled={qcSubmitting}
                      />
                    </div>
                    <div className="flex items-center justify-between px-2 pb-1.5">
                      <span className="text-[9px] text-zinc-500 font-mono">
                        {quickCreate.start.slice(11,16)} – {quickCreate.end.slice(11,16)}
                      </span>
                      <span className="text-[9px] text-zinc-600">Enter ↵ · Esc</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
