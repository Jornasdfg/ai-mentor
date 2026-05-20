"use client";
import { useRef } from "react";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";
import ScheduleBlockCard from "./ScheduleBlockCard";
import GoogleEventBlock from "./GoogleEventBlock";

interface GoogleEvent {
  id: string; title: string; start: string; end: string; allDay: boolean; source: "google_calendar"; calendarId: string;
}

interface Props {
  weekDays: string[];          // ["2026-05-20", ...]  7 days
  blocks: ScheduleBlock[];
  googleEvents: GoogleEvent[];
  tasks: MentorTask[];
  draggingTask: MentorTask | null;
  onDropTask: (taskId: string, start: string, end: string) => Promise<void>;
  onMoveBlock: (blockId: string, start: string, end: string) => Promise<void>;
  startHour?: number;  // default 7
  endHour?: number;    // default 22
}

const DAY_NL = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTH_NL = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];

function labelDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DAY_NL[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NL[d.getUTCMonth()]}`;
}

function positionInGrid(dtISO: string, startHour: number, endHour: number): number {
  if (!dtISO || !dtISO.includes("T")) return 0;
  const [, timePart] = dtISO.split("T");
  const [h, m] = timePart.split(":").map(Number);
  const totalMins = (endHour - startHour) * 60;
  const offsetMins = (h - startHour) * 60 + m;
  return Math.max(0, Math.min(100, (offsetMins / totalMins) * 100));
}

function heightInGrid(startISO: string, endISO: string, startHour: number, endHour: number): number {
  const totalMins = (endHour - startHour) * 60;
  const mins = Math.max(15, (new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000);
  return Math.min(100, (mins / totalMins) * 100);
}

export default function WeekTimeGrid({
  weekDays, blocks, googleEvents, tasks,
  draggingTask, onDropTask, onMoveBlock,
  startHour = 7, endHour = 22,
}: Props) {
  const draggingBlockRef = useRef<ScheduleBlock | null>(null);
  const totalHours = endHour - startHour;
  const hourLabels = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

  function snapToSlot(pct: number, dayISO: string): { start: string; end: string } {
    const totalMins = totalHours * 60;
    const rawMins = Math.round((pct / 100) * totalMins / 15) * 15;
    const offsetMins = Math.max(0, Math.min(totalMins - 30, rawMins));
    const startH = Math.floor((startHour * 60 + offsetMins) / 60);
    const startM = (startHour * 60 + offsetMins) % 60;
    const durationMins = draggingTask?.estimatedMinutes ?? draggingBlockRef.current?.durationMinutes ?? 60;
    const endOffsetMins = offsetMins + durationMins;
    const endH = Math.floor((startHour * 60 + endOffsetMins) / 60);
    const endM = (startHour * 60 + endOffsetMins) % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      start: `${dayISO}T${pad(startH)}:${pad(startM)}:00`,
      end: `${dayISO}T${pad(endH)}:${pad(endM)}:00`,
    };
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, dayISO: string) {
    e.preventDefault();
    const col = e.currentTarget;
    const rect = col.getBoundingClientRect();
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    const { start, end } = snapToSlot(pct, dayISO);

    if (draggingBlockRef.current) {
      onMoveBlock(draggingBlockRef.current.id, start, end);
      draggingBlockRef.current = null;
    } else if (draggingTask) {
      onDropTask(draggingTask.id, start, end);
    }
  }

  const isToday = (iso: string) => iso === new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

  return (
    <div className="flex h-full overflow-hidden">
      {/* Time axis */}
      <div className="w-10 shrink-0 relative">
        <div className="h-7 border-b border-border" /> {/* header spacer */}
        <div className="relative" style={{ height: `calc(100% - 1.75rem)` }}>
          {hourLabels.map(h => (
            <div
              key={h}
              className="absolute w-full text-right pr-1 text-xs text-muted font-mono"
              style={{ top: `${((h - startHour) / totalHours) * 100}%`, transform: "translateY(-50%)" }}
            >
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>
      </div>

      {/* Day columns */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: `repeat(${weekDays.length}, 1fr)` }}>
        {weekDays.map(dayISO => {
          const dayBlocks = blocks.filter(b => b.start.startsWith(dayISO));
          const dayEvents = googleEvents.filter(e => e.start.startsWith(dayISO));

          return (
            <div key={dayISO} className="flex flex-col border-l border-border min-w-0">
              {/* Day header */}
              <div className={`h-7 flex items-center justify-center border-b border-border shrink-0 ${isToday(dayISO) ? "bg-accent/10 text-accent" : ""}`}>
                <span className="text-xs font-mono">{labelDay(dayISO)}</span>
              </div>

              {/* Grid body */}
              <div
                className="relative flex-1 overflow-hidden cursor-crosshair"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, dayISO)}
              >
                {/* Hour grid lines */}
                {hourLabels.map(h => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-border/30"
                    style={{ top: `${((h - startHour) / totalHours) * 100}%` }}
                  />
                ))}

                {/* Google events */}
                {dayEvents.map(ev => (
                  <GoogleEventBlock
                    key={ev.id}
                    event={ev}
                    style={{
                      top: `${positionInGrid(ev.start, startHour, endHour)}%`,
                      height: `${heightInGrid(ev.start, ev.end, startHour, endHour)}%`,
                    }}
                  />
                ))}

                {/* Schedule blocks */}
                {dayBlocks.map(block => {
                  const task = tasks.find(t => t.id === block.taskId);
                  return (
                    <ScheduleBlockCard
                      key={block.id}
                      block={block}
                      task={task}
                      style={{
                        top: `${positionInGrid(block.start, startHour, endHour)}%`,
                        height: `${heightInGrid(block.start, block.end, startHour, endHour)}%`,
                      }}
                      onMove={() => { draggingBlockRef.current = block; }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}