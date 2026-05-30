"use client";
import type { MentorTask, ScheduleBlock } from "@/lib/mentorTypes";

const PRIORITY_CONFIG: Record<string, { label: string; border: string; dot: string; text: string }> = {
  P0: { label: "Do ASAP",  border: "border-l-2 border-red-500",     dot: "bg-red-500",     text: "text-red-600" },
  P1: { label: "Hoog",     border: "border-l-2 border-orange-500",  dot: "bg-orange-500",  text: "text-orange-700" },
  P2: { label: "Normaal",  border: "border-l-2 border-blue-500",    dot: "bg-blue-400",    text: "text-blue-700" },
  P3: { label: "Laag",     border: "border-l-2 border-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700" },
};

interface Props {
  tasks: MentorTask[];
  blocks: ScheduleBlock[];
}

function isActive(t: MentorTask) {
  return t.status === "open" || t.status === "in_progress";
}

export default function PriorityTaskInbox({ tasks, blocks }: Props) {
  const active = tasks.filter(isActive);

  function isScheduled(t: MentorTask): boolean {
    return blocks.some(b => b.taskId === t.id);
  }

  function onDragStart(e: React.DragEvent, t: MentorTask) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("dnd-type", "task");
    e.dataTransfer.setData("dnd-id", t.id);
    e.dataTransfer.setData("dnd-duration", String(t.estimatedMinutes ?? 60));
  }

  const priorities = ["P0", "P1", "P2", "P3"] as const;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-100">
      <div className="px-3 py-3 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">Taken</h3>
        <p className="text-[10px] text-zinc-600 mt-0.5">Sleep naar kalender om in te plannen</p>
      </div>

      {priorities.map(p => {
        const cfg = PRIORITY_CONFIG[p];
        const group = active.filter(t => t.priority === p);
        if (group.length === 0) return null;
        return (
          <div key={p} className="mb-1">
            <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{cfg.label}</span>
              <span className="text-[10px] text-zinc-700 ml-auto">{group.length}</span>
            </div>
            <div className="space-y-1 px-2">
              {group.map(t => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, t)}
                  className={`rounded-r bg-white hover:bg-gray-100 ${cfg.border} px-2.5 py-2 cursor-grab active:cursor-grabbing select-none transition-colors group`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-medium text-zinc-800 leading-tight line-clamp-2">{t.title}</p>
                    {!isScheduled(t) && !t.estimatedMinutes && (
                      <span className="text-[9px] text-zinc-600 shrink-0 mt-0.5">geen duur</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {t.project && <span className="text-[10px] text-zinc-600 truncate">{t.project}</span>}
                    {t.estimatedMinutes && <span className="text-[10px] text-zinc-600">{t.estimatedMinutes}m</span>}
                    {(t.hardDeadline ?? t.deadline) && (
                      <span className="text-[10px] text-zinc-600 ml-auto shrink-0">
                        ⏰ {(t.hardDeadline ?? t.deadline)!.slice(5)}
                      </span>
                    )}
                  </div>
                  {isScheduled(t) && (
                    <div className="flex items-center gap-1 mt-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${t.scheduleColorState === "green" ? "bg-emerald-500" : t.scheduleColorState === "orange" ? "bg-amber-500" : t.scheduleColorState === "red" ? "bg-red-500" : "bg-gray-400"}`} />
                      <span className="text-[10px] text-zinc-600">gepland</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Unschedulable tasks (no estimatedMinutes and autoSchedule off) */}
      {(() => {
        const noTime = active.filter(t => !t.estimatedMinutes && t.autoSchedule !== "off");
        if (!noTime.length) return null;
        return (
          <div className="mt-2 px-3 pb-3 border-t border-gray-200/50">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider pt-2 pb-1 font-semibold">Geen tijdschatting</p>
            {noTime.map(t => (
              <div key={t.id} className="py-1 border-l-2 border-gray-200 pl-2 mb-1">
                <p className="text-[10px] text-zinc-600 truncate">{t.title}</p>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}