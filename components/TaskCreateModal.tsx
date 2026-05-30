"use client";

import { useState } from "react";
import type { MentorPriority, MentorTaskStatus, CalendarSyncMode } from "@/lib/mentorTypes";

interface TaskCreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function TaskCreateModal({ onClose, onCreated }: TaskCreateModalProps) {
  const [title, setTitle] = useState("");
  const [taskKind, setTaskKind] = useState<"task" | "appointment">("task");
  const [project, setProject] = useState("");
  const [priority, setPriority] = useState<MentorPriority>("P2");
  const [status, setStatus] = useState<MentorTaskStatus>("open");
  const [hardDeadline, setHardDeadline] = useState("");
  const [softDeadline, setSoftDeadline] = useState("");
  const [startBy, setStartBy] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [tags, setTags] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [plannedTime, setPlannedTime] = useState("");
  const [plannedMinutes, setPlannedMinutes] = useState("");
  const [calendarSyncMode, setCalendarSyncMode] = useState<CalendarSyncMode>("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError("Titel is verplicht"); return; }
    if (taskKind === "appointment" && !(plannedDate && plannedTime)) {
      setError("Een vaste afspraak heeft een datum én tijd nodig"); return;
    }
    setSaving(true);
    setError(null);
    try {
      // Build planning fields
      let plannedStart: string | undefined;
      let plannedEnd: string | undefined;
      let plannedDateVal: string | undefined;
      let plannedMins: number | undefined;

      if (plannedDate && plannedTime) {
        plannedStart = `${plannedDate}T${plannedTime}:00`;
        const mins = plannedMinutes ? parseInt(plannedMinutes) : 30;
        plannedMins = mins;
        plannedDateVal = plannedDate;
        const endD = new Date(plannedStart);
        endD.setMinutes(endD.getMinutes() + mins);
        const y = endD.getFullYear();
        const mo = String(endD.getMonth() + 1).padStart(2, "0");
        const d = String(endD.getDate()).padStart(2, "0");
        const hh = String(endD.getHours()).padStart(2, "0");
        const mm = String(endD.getMinutes()).padStart(2, "0");
        plannedEnd = `${y}-${mo}-${d}T${hh}:${mm}:00`;
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          project: project.trim() || undefined,
          priority,
          status,
          hardDeadline: hardDeadline || null,
          deadline: hardDeadline || null,
          softDeadline: softDeadline || null,
          startBy: startBy || null,
          leadTimeDays: leadTimeDays ? parseInt(leadTimeDays) : undefined,
          estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
          nextAction: nextAction.trim() || undefined,
          tags: tags.split(",").map(t => t.trim()).filter(Boolean),
          source: "manual_input",
          taskKind,
          plannedDate: plannedDateVal ?? null,
          plannedStart: plannedStart ?? null,
          plannedEnd: plannedEnd ?? null,
          plannedMinutes: plannedMins ?? null,
          // Een vaste afspraak hoort in de agenda → forceer auto-sync naar Google.
          calendarSyncMode: taskKind === "appointment" ? "auto" : calendarSyncMode,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Opslaan mislukt");
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-lg w-full max-w-lg p-5 space-y-3 overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-mono font-semibold text-gray-900">Nieuwe taak</span>
          <button onClick={onClose} className="text-muted hover:text-gray-800 text-lg font-mono leading-none">x</button>
        </div>

        {error && (
          <div className="px-3 py-2 text-xs font-mono text-danger border border-danger/30 rounded bg-danger/5">
            {error}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Titel <span className="text-danger">*</span></label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
          />
        </div>

        {/* Type: flexibele taak vs vaste afspraak */}
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTaskKind("task")}
              className={`flex-1 px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                taskKind === "task"
                  ? "border-accent text-accent bg-accent/10"
                  : "border-border text-muted hover:text-gray-800"
              }`}
            >
              Flexibele taak
            </button>
            <button
              type="button"
              onClick={() => setTaskKind("appointment")}
              className={`flex-1 px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                taskKind === "appointment"
                  ? "border-accent text-accent bg-accent/10"
                  : "border-border text-muted hover:text-gray-800"
              }`}
            >
              Vaste afspraak
            </button>
          </div>
          <p className="mt-1 text-[11px] font-mono text-muted">
            {taskKind === "appointment"
              ? "Vast tijdstip (datum + tijd hieronder verplicht). Wordt niet automatisch verschoven en gaat naar je Google Agenda."
              : "Wordt automatisch ingepland in je vrije werkweek-tijd op basis van prioriteit en duur."}
          </p>
        </div>

        {/* Project */}
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Project</label>
          <input
            type="text"
            value={project}
            onChange={e => setProject(e.target.value)}
            className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
          />
        </div>

        {/* Priority + Status row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Prioriteit</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as MentorPriority)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            >
              {(["P0", "P1", "P2", "P3"] as MentorPriority[]).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as MentorTaskStatus)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            >
              <option value="open">Open</option>
              <option value="in_progress">In uitvoering</option>
            </select>
          </div>
        </div>

        {/* Deadlines row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Harde deadline</label>
            <input
              type="date"
              value={hardDeadline}
              onChange={e => setHardDeadline(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Zachte deadline</label>
            <input
              type="date"
              value={softDeadline}
              onChange={e => setSoftDeadline(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        {/* StartBy + leadTime row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Start uiterlijk</label>
            <input
              type="date"
              value={startBy}
              onChange={e => setStartBy(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Leadtijd (dagen)</label>
            <input
              type="number"
              min={0}
              value={leadTimeDays}
              onChange={e => setLeadTimeDays(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        {/* Time estimate + next action */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Geschatte tijd (min)</label>
            <input
              type="number"
              min={0}
              value={estimatedMinutes}
              onChange={e => setEstimatedMinutes(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Volgende actie</label>
            <input
              type="text"
              value={nextAction}
              onChange={e => setNextAction(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Tags (komma gescheiden)</label>
          <input
            type="text"
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="bijv. klant, malaga, reis"
            className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60 placeholder-muted"
          />
        </div>

        {/* Planning */}
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-mono text-muted uppercase tracking-wider">Inplannen (optioneel)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-muted mb-1">Datum</label>
              <input
                type="date"
                value={plannedDate}
                onChange={e => setPlannedDate(e.target.value)}
                className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-muted mb-1">Tijd</label>
              <input
                type="time"
                value={plannedTime}
                onChange={e => setPlannedTime(e.target.value)}
                className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-muted mb-1">Duur (min)</label>
              <input
                type="number"
                min={5}
                step={5}
                value={plannedMinutes}
                onChange={e => setPlannedMinutes(e.target.value)}
                placeholder="30"
                className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60 placeholder-muted"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-muted mb-1">Agenda-sync</label>
              <select
                value={calendarSyncMode}
                onChange={e => setCalendarSyncMode(e.target.value as CalendarSyncMode)}
                className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
              >
                <option value="none">Geen</option>
                <option value="manual">Handmatig</option>
                <option value="auto">Automatisch</option>
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-mono rounded border border-border text-muted hover:border-danger hover:text-danger transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-1.5 text-sm font-mono rounded border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Bezig..." : "Aanmaken"}
          </button>
        </div>
      </div>
    </div>
  );
}
