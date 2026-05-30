"use client";

import { useState, useEffect } from "react";
import type { ReferenceVersion } from "@/lib/mentorTypes";

interface VersionHistoryProps {
  onRestoreVersion: (content: string) => void;
  refreshTrigger?: number;
}

type VersionSummary = Omit<ReferenceVersion, "content">;

export default function VersionHistory({ onRestoreVersion, refreshTrigger }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/versions")
      .then((r) => r.json())
      .then((data: { versions: VersionSummary[] }) => setVersions(data.versions ?? []))
      .catch(console.error);
  }, [isOpen, refreshTrigger]);

  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setPreviewContent(null);
      return;
    }
    setExpandedId(id);
    setIsLoadingPreview(true);
    try {
      const res = await fetch(`/api/versions?id=${encodeURIComponent(id)}`);
      const data = (await res.json()) as ReferenceVersion;
      setPreviewContent(data.content);
    } catch {
      setPreviewContent("Kon versie niet laden.");
    } finally {
      setIsLoadingPreview(false);
    }
  }

  function handleRestore() {
    if (previewContent) {
      onRestoreVersion(previewContent);
      setIsOpen(false);
    }
  }

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-mono
                   text-muted hover:text-gray-800 bg-panel transition-colors"
      >
        <span>Versiegeschiedenis</span>
        <span>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="bg-surface border-t border-border max-h-72 overflow-y-auto">
          {versions.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted italic">Nog geen opgeslagen versies.</p>
          ) : (
            <ul className="divide-y divide-border">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => handleExpand(v.id)}
                    className="w-full text-left px-4 py-2 text-xs font-mono hover:bg-panel
                               transition-colors flex items-center justify-between"
                  >
                    <span className={expandedId === v.id ? "text-accent" : "text-gray-700"}>
                      {v.label}
                    </span>
                    <span className="text-muted">{expandedId === v.id ? "▴" : "▾"}</span>
                  </button>

                  {expandedId === v.id && (
                    <div className="px-4 pb-3 space-y-2">
                      {isLoadingPreview ? (
                        <p className="text-xs text-muted animate-pulse">Laden...</p>
                      ) : (
                        <>
                          <div className="max-h-32 overflow-y-auto rounded border border-border p-2 bg-panel">
                            <pre className="text-xs text-gray-500 whitespace-pre-wrap font-mono leading-relaxed">
                              {previewContent}
                            </pre>
                          </div>
                          <button
                            onClick={handleRestore}
                            className="px-3 py-1 text-xs font-mono rounded border border-warning/50
                                       text-warning hover:bg-warning/10 transition-colors"
                          >
                            Herstel deze versie
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
