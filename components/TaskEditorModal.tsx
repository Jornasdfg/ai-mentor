"use client";

import { useState, useEffect } from "react";
import type { MentorTask, MentorPriority } from "@/lib/mentorTypes";

interface TaskEditorModalProps {
  task: MentorTask | null;
  onClose: () => void;
  onSave: (updated: Partial<MentorTask>) => void;
}

export default function TaskEditorModal({ task, onClose, onSave }: TaskEditorModalProps) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [priority, setPriority] = useState<MentorPriority>("P2");
  const [hardDeadline, setHardDeadline] = useState("");
  const [softDeadline, setSoftDeadline] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setProject(task.project ?? "");
    setPriority(task.priority);
    setHardDeadline(task.hardDeadline ?? task.deadline ?? "");
    setSoftDeadline(task.softDeadline ?? "");
    setEstimatedMinutes(task.estimatedMinutes?.toString() ?? "");
    setNextAction(task.nextAction ?? "");
    setTags((task.tags ?? []).join(", "));
  }, [task]);

  if (!task) return null;

  function handleSave() {
    const mins = estimatedMinutes ? parseInt(estimatedMinutes) : undefined;
    onSave({
      title: title.trim() || task!.title,
      project: project.trim() || undefined,
      priority,
      hardDeadline: hardDeadline || null,
      deadline: hardDeadline || null,
      softDeadline: softDeadline || null,
      estimatedMinutes: isNaN(mins!) ? undefined : mins,
      nextAction: nextAction.trim() || undefined,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
    });
  }

  const fields = [
    { label: "Titel", value: title, onChange: setTitle, type: "text" },
    { label: "Project", value: project, onChange: setProject, type: "text" },
    { label: "Harde deadline", value: hardDeadline, onChange: setHardDeadline, type: "date" },
    { label: "Zachte deadline", value: softDeadline, onChange: setSoftDeadline, type: "date" },
    { label: "Geschatte tijd (min)", value: estimatedMinutes, onChange: setEstimatedMinutes, type: "number" },
    { label: "Volgende actie", value: nextAction, onChange: setNextAction, type: "text" },
    { label: "Tags (komma gescheiden)", value: tags, onChange: setTags, type: "text" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-lg w-full max-w-lg p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-mono font-semibold text-gray-100">Taak bewerken</span>
          <button onClick={onClose} className="text-muted hover:text-gray-200 text-lg font-mono leading-none">x</button>
        </div>

        {fields.map(field => (
          <div key={field.label}>
            <label className="block text-xs font-mono text-muted mb-1">{field.label}</label>
            <input
              type={field.type}
              value={field.value}
              onChange={e => field.onChange(e.target.value)}
              className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-200 border border-border rounded focus:outline-none focus:border-accent/60"
            />
          </div>
        ))}

        <div>
          <label className="block text-xs font-mono text-muted mb-1">Prioriteit</label>
          <select
            value={priority}
            onChange={e => setPriority(e.target.value as MentorPriority)}
            className="w-full px-3 py-1.5 font-mono text-sm bg-surface text-gray-200 border border-border rounded focus:outline-none focus:border-accent/60"
          >
            {(["P0", "P1", "P2", "P3"] as MentorPriority[]).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm font-mono rounded border border-border text-muted hover:border-danger hover:text-danger transition-colors">Annuleren</button>
          <button onClick={handleSave} className="px-4 py-1.5 text-sm font-mono rounded border border-accent text-accent hover:bg-accent/10 transition-colors">Opslaan</button>
        </div>
      </div>
    </div>
  );
}
