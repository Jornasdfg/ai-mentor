"use client";
import type { ScheduleBlock, MentorTask } from "@/lib/mentorTypes";

const COLOR_CLASSES: Record<string, string> = {
  green:  "bg-green-900/40 border-green-600/50 text-green-300",
  orange: "bg-orange-900/40 border-orange-600/50 text-orange-300",
  red:    "bg-red-900/40 border-red-600/50 text-red-300",
  gray:   "bg-surface border-border text-muted",
};

interface Props {
  block: ScheduleBlock;
  task?: MentorTask;
  style?: React.CSSProperties;
  onMove?: (block: ScheduleBlock) => void;
}

export default function ScheduleBlockCard({ block, task, style, onMove }: Props) {
  const colorClass = COLOR_CLASSES[block.colorState] ?? COLOR_CLASSES.gray;
  const timeLabel = `${block.start.slice(11, 16)}–${block.end.slice(11, 16)}`;

  return (
    <div
      className={`absolute left-1 right-1 rounded border px-1.5 py-0.5 text-xs font-mono overflow-hidden cursor-pointer hover:opacity-90 transition-opacity ${colorClass} ${block.locked ? "border-dashed" : ""}`}
      style={style}
      title={`${block.title} | ${timeLabel} | ${block.durationMinutes}min${block.locked ? " | locked" : ""}`}
      onClick={() => onMove?.(block)}
    >
      <div className="font-semibold truncate leading-tight">{block.title}</div>
      <div className="opacity-70">{timeLabel}</div>
      {task?.priority && (
        <span className="opacity-60">{task.priority}</span>
      )}
    </div>
  );
}