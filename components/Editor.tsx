"use client";

import { useEffect } from "react";

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave: (content: string) => void;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: string | null;
  saveError: string | null;
}

export default function Editor({
  content,
  onChange,
  onSave,
  isDirty,
  isSaving,
  lastSaved,
  saveError,
}: EditorProps) {
  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) onSave(content);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, content, onSave]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Editorbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-panel shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted">daily_reference.md</span>
          {isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-warning" title="Niet opgeslagen" />
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-muted hidden sm:block">
              Opgeslagen: {lastSaved}
            </span>
          )}
          <button
            onClick={() => onSave(content)}
            disabled={!isDirty || isSaving}
            className="px-3 py-1 text-xs font-mono rounded border border-border
                       hover:border-accent hover:text-accent transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 w-full p-4 font-mono text-sm bg-surface text-gray-200
                   resize-none focus:outline-none leading-relaxed min-h-0"
        spellCheck={false}
        placeholder="Laad het referentiebestand..."
      />

      {saveError && (
        <div className="px-4 py-1.5 text-xs text-danger border-t border-border bg-panel shrink-0">
          {saveError}
        </div>
      )}
    </div>
  );
}
