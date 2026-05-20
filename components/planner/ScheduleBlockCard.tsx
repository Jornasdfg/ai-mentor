"use client";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";

const DEADLINE_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  green:  { bg: "bg-emerald-900/70",  border: "border-l-[3px] border-emerald-400", text: "text-emerald-100" },
  orange: { bg: "bg-amber-900/70",    border: "border-l-[3px] border-amber-400",   text: "text-amber-100" },
  red:    { bg: "bg-red-900/70",      border: "border-l-[3px] border-red-400",     text: "text-red-100" },
  gray:   { bg: "bg-zinc-800/70",     border: "border-l-[3px] border-zinc-500",    text: "text-zinc-300" },
};

const PRIORITY_DOT: Record<string, string> = {
  P0: "bg-red-500", P1: "bg-orange-500", P2: "bg-blue-400", P3: "bg-emerald-500",
};

interface Props {
  block: ScheduleBlock;
  task?: MentorTask;
  heightPx: number;
}

export default function ScheduleBlockCard({ block, task, heightPx }: Props) {
  const s = DEADLINE_STYLE[block.colorState] ?? DEADLINE_STYLE.gray;
  const time = `${block.start.slice(11, 16)}–${block.end.slice(11, 16)}`;
  const isSmall = heightPx < 36;

  function onDragStart(e: React.DragEvent) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("dnd-type", "block");
    e.dataTransfer.setData("dnd-id", block.id);
    e.dataTransfer.setData("dnd-duration", String(block.durationMinutes));
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`absolute left-0.5 right-0.5 rounded-r overflow-hidden cursor-grab active:cursor-grabbing select-none ${s.bg} ${s.border} ${s.text} ${block.locked ? "opacity-90" : ""}`}
      title={`${block.title} | ${time} | ${block.durationMinutes}min${block.locked ? " | 🔒 locked" : ""}`}
    >
      {isSmall ? (
        <div className="px-1.5 py-0.5 flex items-center gap-1 h-full">
          {task?.priority && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? "bg-gray-500"}`} />}
          <span className="text-[10px] font-medium truncate leading-none">{block.title}</span>
        </div>
      ) : (
        <div className="px-1.5 py-1 h-full flex flex-col justify-between">
          <div className="flex items-start gap-1">
            {task?.priority && <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? "bg-gray-500"}`} />}
            <span className="text-xs font-semibold leading-tight line-clamp-2">{block.title}</span>
          </div>
          <div className="text-[10px] opacity-70 mt-auto">{time}</div>
        </div>
      )}
    </div>
  );
}