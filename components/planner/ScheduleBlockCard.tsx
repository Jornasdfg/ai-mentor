"use client";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";
import { isRoutine } from "@/lib/mentor/taskCharacter";

const SOLID_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  green:  { bg: "bg-emerald-900/70",  border: "border-l-[3px] border-emerald-400", text: "text-emerald-100" },
  orange: { bg: "bg-amber-900/70",    border: "border-l-[3px] border-amber-400",   text: "text-amber-100" },
  red:    { bg: "bg-red-900/70",      border: "border-l-[3px] border-red-400",     text: "text-red-100" },
  gray:   { bg: "bg-white/70",     border: "border-l-[3px] border-gray-300",    text: "text-zinc-700" },
};

const SUGGESTION_STYLE: Record<string, { border: string; text: string; btn: string }> = {
  green:  { border: "border-emerald-500/50", text: "text-emerald-700/80", btn: "bg-emerald-600/80 hover:bg-emerald-500 text-white" },
  orange: { border: "border-amber-500/50",   text: "text-amber-700/80",   btn: "bg-amber-600/80 hover:bg-amber-500 text-white" },
  red:    { border: "border-red-500/50",     text: "text-red-600/80",     btn: "bg-red-600/80 hover:bg-red-500 text-white" },
  gray:   { border: "border-gray-300/50",    text: "text-zinc-600/80",    btn: "bg-gray-400/80 hover:bg-gray-300 text-white" },
};

const PRIORITY_DOT: Record<string, string> = {
  P0: "bg-red-500", P1: "bg-orange-500", P2: "bg-blue-400", P3: "bg-emerald-500",
};

interface Props {
  block: ScheduleBlock;
  task?: MentorTask;
  heightPx: number;
  onClick?: () => void;
  onResizeStart?: (clientY: number) => void;
  onMoveStart?: (clientY: number) => void;
  onConfirm?: () => void;
}

export default function ScheduleBlockCard({ block, task, heightPx, onClick, onResizeStart, onMoveStart, onConfirm }: Props) {
  const isSuggestion = block.source === "auto_scheduler" && !block.locked;
  const time = `${block.start.slice(11, 16)}–${block.end.slice(11, 16)}`;
  const isSmall = heightPx < 40;
  const colorKey = block.colorState ?? "gray";
  const routine = task ? isRoutine(task) : false;
  const showMoveGrip = !!onMoveStart && heightPx >= 30;

  // Sleep-greep (verplaatsen) — rechtsboven, touch-action:none zodat slepen niet scrollt.
  const MoveGrip = showMoveGrip ? (
    <div
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onMoveStart!(e.clientY); }}
      onTouchStart={(e) => { e.stopPropagation(); if (e.touches[0]) onMoveStart!(e.touches[0].clientY); }}
      onClick={(e) => e.stopPropagation()}
      style={{ touchAction: "none" }}
      title="Sleep om te verplaatsen"
      aria-label="Verplaats blok"
      className="absolute top-0 right-0 w-9 h-7 flex items-center justify-center z-20 cursor-grab active:cursor-grabbing opacity-50 hover:opacity-90"
    >
      <span className="text-[13px] leading-none select-none">⠿</span>
    </div>
  ) : null;

  // Verleng-greep (duur) — onderrand, altijd zichtbaar (ook op touch).
  const ResizeGrip = onResizeStart ? (
    <div
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onResizeStart(e.clientY); }}
      onTouchStart={(e) => { e.stopPropagation(); if (e.touches[0]) onResizeStart(e.touches[0].clientY); }}
      onClick={(e) => e.stopPropagation()}
      style={{ touchAction: "none" }}
      title="Sleep om de duur aan te passen"
      aria-label="Pas duur aan"
      className="absolute bottom-0 left-0 right-0 h-4 flex items-end justify-center z-20 cursor-ns-resize"
    >
      <div className="mb-0.5 w-8 h-1 rounded-full bg-current opacity-40" />
    </div>
  ) : null;

  const bodyBottom = onResizeStart ? "bottom-3.5" : "";

  if (isSuggestion) {
    const s = SUGGESTION_STYLE[colorKey] ?? SUGGESTION_STYLE.gray;
    return (
      <div className="h-full w-full relative group">
        <div
          onClick={onClick}
          className={`absolute inset-0 ${bodyBottom} rounded-r overflow-hidden select-none
            bg-white/40 border border-dashed ${s.border} ${s.text} cursor-pointer transition-all hover:bg-gray-100/50`}
          title={`Suggestie: ${block.title} | ${time}`}
        >
          {isSmall ? (
            <div className="px-1.5 py-0.5 flex items-center gap-1 h-full">
              <span className="text-[9px] opacity-60">◌</span>
              <span className="text-[10px] font-medium truncate leading-none opacity-80">{routine ? "🔁 " : ""}{block.title}</span>
            </div>
          ) : (
            <div className="px-1.5 py-1 h-full flex flex-col justify-between">
              <div className="flex items-start gap-1 pr-7">
                <span className="text-[9px] mt-0.5 opacity-50 shrink-0">◌</span>
                <span className="text-xs font-medium leading-tight line-clamp-2 opacity-80">{routine ? "🔁 " : ""}{block.title}</span>
              </div>
              <div className="flex items-center justify-between mt-auto gap-1">
                <span className="text-[10px] opacity-50">{time}</span>
                {onConfirm && heightPx >= 52 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onConfirm(); }}
                    className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors ${s.btn}`}
                  >Plannen</button>
                )}
              </div>
            </div>
          )}
        </div>
        {MoveGrip}
        {ResizeGrip}
      </div>
    );
  }

  const s = SOLID_STYLE[colorKey] ?? SOLID_STYLE.gray;
  return (
    <div className="h-full w-full relative group">
      <div
        onClick={onClick}
        className={`absolute inset-0 ${bodyBottom} rounded-r overflow-hidden select-none ${s.bg} ${s.border} ${s.text} transition-all ${onClick ? "cursor-pointer hover:brightness-110" : ""}`}
        title={`${block.title} | ${time} | ${block.durationMinutes}min${block.locked ? " | vergrendeld" : ""}`}
      >
        {isSmall ? (
          <div className="px-1.5 py-0.5 flex items-center gap-1 h-full">
            {task?.priority && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? "bg-gray-500"}`} />}
            <span className="text-[10px] font-medium truncate leading-none">{routine ? "🔁 " : ""}{block.title}</span>
          </div>
        ) : (
          <div className="px-1.5 py-1 h-full flex flex-col justify-between">
            <div className="flex items-start gap-1 pr-7">
              {task?.priority && <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] ?? "bg-gray-500"}`} />}
              <span className="text-xs font-semibold leading-tight line-clamp-2">{routine ? "🔁 " : ""}{block.title}</span>
            </div>
            <div className="text-[10px] opacity-70 mt-auto">{time}</div>
          </div>
        )}
      </div>
      {MoveGrip}
      {ResizeGrip}
    </div>
  );
}
