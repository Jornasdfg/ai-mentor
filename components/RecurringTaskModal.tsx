"use client";

import { useState, useEffect } from "react";
import type { MentorPriority, MentorRecurringTask, RecurrenceFrequency, CalendarSyncMode } from "@/lib/mentorTypes";

interface RecurringTaskModalProps {
  template?: MentorRecurringTask | null;
  onClose: () => void;
  onSaved: () => void;
}

const WEEKDAYS = [
  { label: "Ma", value: 1 },
  { label: "Di", value: 2 },
  { label: "Wo", value: 3 },
  { label: "Do", value: 4 },
  { label: "Vr", value: 5 },
  { label: "Za", value: 6 },
  { label: "Zo", value: 0 },
];

export default function RecurringTaskModal({ template, onClose, onSaved }: RecurringTaskModalProps) {
  const isEdit = !!template;

  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("weekly");
  const [interval, setInterval] = useState("1");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [startDate, setStartDate] = useState(() =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" })
  );
  const [endDate, setEndDate] = useState("");
  const [priority, setPriority] = useState<MentorPriority>("P2");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [tags, setTags] = useState("");
  const [hardDeadlineOffsetDays, setHardDeadlineOffsetDays] = useState("");
  const [softDeadlineOffsetDays, setSoftDeadlineOffsetDays] = useState("");
  const [executionMode, setExecutionMode] = useState<"manual" | "mcp_ready">("manual");
  const [futureMcpAction, setFutureMcpAction] = useState("");
  const [defaultPlannedTime, setDefaultPlannedTime] = useState("");
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState("");
  const [calendarSyncMode, setCalendarSyncMode] = useState<CalendarSyncMode>("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!template) return;
    setTitle(template.title);
    setProject(template.project ?? "");
    setFrequency(template.frequency);
    setInterval(String(template.interval));
    setDaysOfWeek(template.daysOfWeek ?? []);
    setDayOfMonth(template.dayOfMonth?.toString() ?? "");
    setStartDate(template.startDate);
    setEndDate(template.endDate ?? "");
    setPriority(template.priority);
    setLeadTimeDays(template.leadTimeDays?.toString() ?? "");
    setEstimatedMinutes(template.estimatedMinutes?.toString() ?? "");
    setNextAction(template.nextAction ?? "");
    setTags((template.tags ?? []).join(", "));
    setHardDeadlineOffsetDays(template.hardDeadlineOffsetDays?.toString() ?? "");
    setSoftDeadlineOffsetDays(template.softDeadlineOffsetDays?.toString() ?? "");
    setExecutionMode(template.executionMode);
    setFutureMcpAction(template.futureMcpAction ?? "");
    setDefaultPlannedTime(template.defaultPlannedTime ?? "");
    setDefaultDurationMinutes(template.defaultDurationMinutes?.toString() ?? "");
    setCalendarSyncMode(template.calendarSyncMode ?? "none");
  }, [template]);

  function toggleDay(v: number) {
    setDaysOfWeek(prev =>
      prev.includes(v) ? prev.filter(d => d !== v) : [...prev, v]
    );
  }

  async function handleSave() {
    if (!title.trim()) { setError("Titel is verplicht"); return; }
    if (!startDate) { setError("Startdatum is verplicht"); return; }
    setSaving(true);
    setError(null);

    const body: Partial<MentorRecurringTask> = {
      title: title.trim(),
      project: project.trim() || undefined,
      frequency,
      interval: parseInt(interval) || 1,
      daysOfWeek: frequency === "weekly" && daysOfWeek.length > 0 ? daysOfWeek : undefined,
      dayOfMonth: frequency === "monthly" && dayOfMonth ? parseInt(dayOfMonth) : undefined,
      startDate,
      endDate: endDate || null,
      priority,
      leadTimeDays: leadTimeDays ? parseInt(leadTimeDays) : undefined,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : undefined,
      nextAction: nextAction.trim() || undefined,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      hardDeadlineOffsetDays: hardDeadlineOffsetDays !== "" ? parseInt(hardDeadlineOffsetDays) : undefined,
      softDeadlineOffsetDays: softDeadlineOffsetDays !== "" ? parseInt(softDeadlineOffsetDays) : undefined,
      executionMode,
      futureMcpAction: executionMode === "mcp_ready" && futureMcpAction.trim() ? futureMcpAction.trim() : undefined,
      defaultPlannedTime: defaultPlannedTime.trim() || undefined,
      defaultDurationMinutes: defaultDurationMinutes ? parseInt(defaultDurationMinutes) : undefined,
      calendarSyncMode,
    };

    try {
      const url = isEdit ? `/api/recurring-tasks/${template!.id}` : "/api/recurring-tasks";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Opslaan mislukt");
      }
      onSaved();
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
          <span className="text-sm font-mono font-semibold text-gray-900">
            {isEdit ? "Routine bewerken" : "Nieuwe routine"}
          </span>
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

        {/* Frequency + interval */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Frequentie</label>
            <select
              value={frequency}
              onChange={e => setFrequency(e.target.value as RecurrenceFrequency)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            >
              <option value="daily">Dagelijks</option>
              <option value="weekly">Wekelijks</option>
              <option value="monthly">Maandelijks</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Elke N {frequency === "daily" ? "dagen" : frequency === "weekly" ? "weken" : "maanden"}</label>
            <input
              type="number"
              min={1}
              value={interval}
              onChange={e => setInterval(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        {/* Weekly: day selector */}
        {frequency === "weekly" && (
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Dag(en) van de week</label>
            <div className="flex gap-1 flex-wrap">
              {WEEKDAYS.map(day => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`px-2 py-1 text-xs font-mono rounded border transition-colors ${
                    daysOfWeek.includes(day.value)
                      ? "border-accent text-accent bg-accent/10"
                      : "border-border text-muted hover:border-accent/50 hover:text-gray-800"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Monthly: day of month */}
        {frequency === "monthly" && (
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Dag van de maand (1–31)</label>
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={e => setDayOfMonth(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
        )}

        {/* Start + end date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Startdatum <span className="text-danger">*</span></label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Einddatum (optioneel)</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        {/* Priority */}
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

        {/* Deadline offsets */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Harde deadline offset (dagen)</label>
            <input
              type="number"
              value={hardDeadlineOffsetDays}
              onChange={e => setHardDeadlineOffsetDays(e.target.value)}
              placeholder="0 = zelfde dag"
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60 placeholder-muted"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Zachte deadline offset (dagen)</label>
            <input
              type="number"
              value={softDeadlineOffsetDays}
              onChange={e => setSoftDeadlineOffsetDays(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
        </div>

        {/* Lead time + estimate */}
        <div className="grid grid-cols-2 gap-3">
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
        </div>

        {/* Next action + tags */}
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Volgende actie</label>
          <input
            type="text"
            value={nextAction}
            onChange={e => setNextAction(e.target.value)}
            className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-muted mb-1">Tags (komma gescheiden)</label>
          <input
            type="text"
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="bijv. dagstart, review"
            className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60 placeholder-muted"
          />
        </div>

        {/* Planning defaults */}
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-mono text-muted uppercase tracking-wider">Standaard inplannen (optioneel)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-muted mb-1">Standaard inplannen om</label>
              <input
                type="time"
                value={defaultPlannedTime}
                onChange={e => setDefaultPlannedTime(e.target.value)}
                className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-muted mb-1">Duur in minuten</label>
              <input
                type="number"
                min={5}
                step={5}
                value={defaultDurationMinutes}
                onChange={e => setDefaultDurationMinutes(e.target.value)}
                placeholder={estimatedMinutes || "30"}
                className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60 placeholder-muted"
              />
            </div>
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

        {/* Execution mode */}
        <div>
          <label className="block text-xs font-mono text-muted mb-1">Uitvoeringsmodus</label>
          <select
            value={executionMode}
            onChange={e => setExecutionMode(e.target.value as "manual" | "mcp_ready")}
            className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60"
          >
            <option value="manual">Handmatig</option>
            <option value="mcp_ready">MCP-ready (later)</option>
          </select>
        </div>

        {executionMode === "mcp_ready" && (
          <div>
            <label className="block text-xs font-mono text-muted mb-1">Toekomstige MCP-actie (omschrijving)</label>
            <input
              type="text"
              value={futureMcpAction}
              onChange={e => setFutureMcpAction(e.target.value)}
              placeholder="bijv. send_slack_reminder, run_script"
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-800 border border-border rounded focus:outline-none focus:border-accent/60 placeholder-muted"
            />
          </div>
        )}

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
            disabled={saving || !title.trim() || !startDate}
            className="px-4 py-1.5 text-sm font-mono rounded border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Bezig..." : isEdit ? "Opslaan" : "Aanmaken"}
          </button>
        </div>
      </div>
    </div>
  );
}
