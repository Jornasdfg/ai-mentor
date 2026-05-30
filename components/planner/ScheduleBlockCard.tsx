"use client";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";

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
  onResizeStart?: (e: React.MouseEvent) => void;
  onConfirm?: () => void;
}

export default function ScheduleBlockCard({ block, task, heightPx, onClick, onResizeStart, onConfirm }: Props) {
  const isSuggestion = block.source === "auto_scheduler" && !block.locked;
  const time = `${block.start.slice(11, 16)}–${block.end.slice(11, 16)}`;
  const isSmall = heightPx < 40;
  const colorKey = block.colorState ?? "gray";

  function onDragStart(e: React.DragEvent) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("dnd-type", "block");
    e.dataTransfer.setData("dnd-id", block.id);
    e.dataTransfer.setData("dnd-duration", String(block.durationMinutes));
  }

  if (isSuggestion) {
    const s = SUGGESTION_STYLE[colorKey] ?? SUGGESTION_STYLE.gray;
    return (
      <div className="h-full w-full relative group">
        <div
          draggable
          onDragStart={onDragStart}
          onClick={onClick}
          className={`absolute inset-0 ${onResizeStart ? "bottom-2" : ""} rounded-r overflow-hidden select-none
            bg-white/40 border border-dashed ${s.border} ${s.text}
            cursor-grab active:cursor-grabbing transition-all hover:bg-gray-100/50`}
          title={`Suggestie: ${block.title} | ${time} | Klik Plannen om te bevestigen`}
        >
          {isSmall ? (
            <div className="px-1.5 py-0.5 flex items-center gap-1 h-full">
              <span className="text-[9px] opacity-60">◌</span>
              <span className="text-[10px] font-medium truncate leading-none opacity-80">{block.title}</span>
            </div>
          ) : (
            <div className="px-1.5 py-1 h-full flex flex-col justify-between">
              <div className="flex items-start gap-1">
                <span className="text-[9px] mt-0.5 opacity-50 shrink-0">◌</span>
                <span className="text-xs font-medium leading-tight line-clamp-2 opacity-80">{block.title}</span>
              </div>
              <div className="flex items-center justify-between mt-auto gap-1">
                <span className="text-[10px] opacity-50">{time}</span>
                {onConfirm && heightPx >= 52 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onConfirm(); }}
                    className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors ${s.btn}`}
                  >
                    Plannen
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Plannen button for small blocks — shown on hover */}
          {onConfirm && heightPx < 52 && (
            <div className="absolute inset-0 flex items-center justify-end pr-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
              <button
                onClick={(e) => { e.stopPropagation(); onConfirm(); }}
                className={`text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors ${s.btn}`}
              >
                ✓
              </button>
            </div>
          )}
        </div>
        {onResizeStart && (
          <div
            className="absolute bottom-0 left-0 right-0 h-2 z-10 cursor-s-resize rounded-b opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20"
            onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e); }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    );
  }

  // Solid confirmed block
  const s = SOLID_STYLE[colorKey] ?? SOLID_STYLE.gray;
  return (
    <div className="h-full w-full relative group">
      <div
        draggable
        onDragStart={onDragStart}
        onClick={onClick}
        className={`absolute inset-0 ${onResizeStart ? "bottom-2" : ""} rounded-r overflow-hidden select-none ${s.bg} ${s.border} ${s.text} transition-all ${onClick ? "cursor-pointer hover:brightness-110" : "cursor-grab active:cursor-grabbing"}`}
        title={`${block.title} | ${time} | ${block.durationMinutes}min${block.locked ? " | vergrendeld" : ""}`}
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
      {onResizeStart && (
        <div
          className="absolute bottom-0 left-0 right-0 h-2 z-10 cursor-s-resize rounded-b opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 hover:bg-white/40"
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e); }}
          onClick={(e) => e.stopPropagation()}
          title="Versleep om duur aan te passen"
        />
      )}
    </div>
  );
}
