"use client";
import type { MentorTask, ScheduleBlock } from "@/lib/mentorTypes";

interface Props {
  tasks: MentorTask[];
  blocks: ScheduleBlock[];
  onDragStart?: (task: MentorTask) => void;
}

const GROUPS = [
  { label: "P0 — Do ASAP", filter: (t: MentorTask) => t.priority === "P0" && t.status !== "done" && t.status !== "cancelled" },
  { label: "P1 — High",    filter: (t: MentorTask) => t.priority === "P1" && t.status !== "done" && t.status !== "cancelled" },
  { label: "P2 — Normal",  filter: (t: MentorTask) => t.priority === "P2" && t.status !== "done" && t.status !== "cancelled" },
  { label: "P3 — Low",     filter: (t: MentorTask) => t.priority === "P3" && t.status !== "done" && t.status !== "cancelled" },
];

const PRIORITY_COLOR: Record<string, string> = {
  P0: "text-danger", P1: "text-warning", P2: "text-accent", P3: "text-muted",
};

const SCHEDULE_DOT: Record<string, string> = {
  green: "bg-green-500", orange: "bg-orange-500", red: "bg-red-500", gray: "bg-gray-600",
};

export default function PriorityTaskInbox({ tasks, blocks, onDragStart }: Props) {
  function isScheduled(t: MentorTask): boolean {
    return blocks.some(b => b.taskId === t.id);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-xs font-mono font-bold text-gray-200">Inbox</h3>
        <p className="text-xs text-muted font-mono">Sleep naar kalender</p>
      </div>

      {GROUPS.map(group => {
        const groupTasks = tasks.filter(group.filter);
        if (groupTasks.length === 0) return null;
        return (
          <div key={group.label} className="border-b border-border/50">
            <div className="px-3 pt-2 pb-1">
              <span className="text-xs font-mono font-bold text-muted uppercase tracking-wide">{group.label}</span>
            </div>
            <div className="px-2 pb-2 space-y-1">
              {groupTasks.map(t => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => onDragStart?.(t)}
                  className="flex items-start gap-2 p-2 rounded border border-border bg-surface hover:border-accent/40 hover:bg-accent/5 cursor-grab active:cursor-grabbing transition-colors group"
                >
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SCHEDULE_DOT[t.scheduleColorState ?? "gray"]}`} title={t.scheduleStatus ?? "unscheduled"} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-mono font-medium truncate ${PRIORITY_COLOR[t.priority]}`}>{t.title}</p>
                    {t.project && <p className="text-xs text-muted font-mono truncate">{t.project}</p>}
                    <div className="flex gap-2 text-xs text-muted font-mono mt-0.5">
                      {t.estimatedMinutes && <span>{t.estimatedMinutes}min</span>}
                      {(t.hardDeadline ?? t.deadline) && <span>⏰ {(t.hardDeadline ?? t.deadline)!.slice(0, 10)}</span>}
                      {!isScheduled(t) && <span className="text-warning">niet gepland</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Unscheduled */}
      {(() => {
        const unscheduled = tasks.filter(t =>
          (t.status === "open" || t.status === "in_progress") &&
          (t.scheduleStatus === "unscheduled" || (!t.scheduleStatus && !blocks.some(b => b.taskId === t.id)))
        );
        if (unscheduled.length === 0) return null;
        return (
          <div className="border-b border-border/50">
            <div className="px-3 pt-2 pb-1">
              <span className="text-xs font-mono font-bold text-muted uppercase tracking-wide">Niet ingepland</span>
            </div>
            <div className="px-2 pb-2 space-y-1">
              {unscheduled.map(t => (
                <div key={t.id} draggable onDragStart={() => onDragStart?.(t)}
                  className="flex items-start gap-2 p-2 rounded border border-border bg-surface hover:border-warning/40 cursor-grab transition-colors"
                >
                  <div className="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-gray-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono truncate text-gray-300">{t.title}</p>
                    {t.unscheduledReason && <p className="text-xs text-warning font-mono">{t.unscheduledReason}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Missed deadline */}
      {(() => {
        const missed = tasks.filter(t => t.scheduleStatus === "missed" && t.status !== "done" && t.status !== "cancelled");
        if (missed.length === 0) return null;
        return (
          <div>
            <div className="px-3 pt-2 pb-1">
              <span className="text-xs font-mono font-bold text-danger uppercase tracking-wide">Deadline gemist</span>
            </div>
            <div className="px-2 pb-2 space-y-1">
              {missed.map(t => (
                <div key={t.id} className="p-2 rounded border border-danger/30 bg-danger/5">
                  <p className="text-xs font-mono text-danger truncate">{t.title}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}