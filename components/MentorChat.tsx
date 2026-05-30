"use client";

import { useState, useRef, useEffect } from "react";
import type { MentorPatch } from "@/lib/mentorTypes";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Message extends ChatMessage {
  id: string;
  patches?: MentorPatch[];
  patchState?: "pending" | "applied" | "dismissed";
  costUSD?: number;
}

const QUICK_STARTERS = [
  "Wat moet ik vandaag doen?",
  "Help me de volgende taak voorbereiden",
  "Ik wil een nieuwe taak toevoegen",
  "Wat loopt er qua deadline gevaar?",
];

export default function MentorChat({ onComplete }: { onComplete?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);

  async function toggleRecording() {
    if (recording) { mediaRecorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "audio.webm");
          fd.append("durationMs", String(Date.now() - recordStartRef.current));
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json() as { text?: string; error?: string };
          if (!res.ok) throw new Error(data.error ?? "Transcriptie mislukt");
          const text = (data.text ?? "").trim();
          if (text) setInput(prev => (prev ? prev + " " : "") + text);
          textareaRef.current?.focus();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcriptie mislukt");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = rec;
      recordStartRef.current = Date.now();
      rec.start();
      setRecording(true);
      setError(null);
    } catch {
      setError("Geen toegang tot microfoon — sta microfoon toe in je browser.");
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setError(null);

    const userMsg: Message = { id: `u_${Date.now()}`, role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build plain conversation history to send (no patch metadata)
      const history: ChatMessage[] = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: msg, conversationMessages: history }),
      });
      const data = await res.json() as { message?: string; patches?: MentorPatch[]; error?: string; usage?: { costUSD: number } };
      if (!res.ok) throw new Error(data.error ?? "Fout");

      const aiMsg: Message = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: data.message ?? "",
        patches: (data.patches ?? []).length > 0 ? data.patches : undefined,
        patchState: "pending",
        costUSD: data.usage?.costUSD,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout");
      // Remove the user message if request failed
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setLoading(false);
    }
  }

  async function applyPatches(msgId: string, patches: MentorPatch[]) {
    try {
      const res = await fetch("/api/mentor/apply-patches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patches }),
      });
      if (!res.ok) throw new Error("Patches toepassen mislukt");
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, patchState: "applied" } : m));
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout bij toepassen");
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-200 shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">AI Mentor</span>
        <span className="text-[10px] text-zinc-700">gpt-4o-mini</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="space-y-3 mt-2">
            <p className="text-sm text-zinc-600 leading-relaxed">
              Vertel wat er speelt, vraag om advies, of zeg wat je wil toevoegen aan je taken.
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {QUICK_STARTERS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="text-left text-xs text-zinc-600 border border-gray-200 rounded-lg px-3 py-2 hover:border-gray-300 hover:text-zinc-800 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] space-y-2 ${msg.role === "user" ? "ml-8" : "mr-4"}`}>
              {/* Bubble */}
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-white text-zinc-900 rounded-bl-sm"
              }`}>
                {msg.content}
              </div>

              {/* Cost (tiny, assistant only) */}
              {msg.role === "assistant" && msg.costUSD !== undefined && (
                <p className="text-[9px] text-zinc-700 ml-1">${(msg.costUSD * 100).toFixed(3)}¢</p>
              )}

              {/* Patches */}
              {msg.patches && msg.patches.length > 0 && (
                <div className={`rounded-xl border p-3 space-y-2 ${
                  msg.patchState === "applied"
                    ? "border-emerald-700/30 bg-emerald-900/10"
                    : msg.patchState === "dismissed"
                    ? "border-gray-200 bg-white/50 opacity-50"
                    : "border-blue-500/25 bg-blue-500/5"
                }`}>
                  {msg.patchState === "applied" ? (
                    <p className="text-xs text-emerald-700">✓ Wijzigingen toegepast</p>
                  ) : msg.patchState === "dismissed" ? (
                    <p className="text-xs text-zinc-600">Genegeerd</p>
                  ) : (
                    <>
                      <p className="text-[10px] text-blue-700 uppercase tracking-wider font-semibold">
                        {msg.patches.length} voorgestelde wijziging{msg.patches.length !== 1 ? "en" : ""}
                      </p>
                      <div className="space-y-0.5">
                        {msg.patches.map((p, i) => (
                          <p key={i} className="text-xs text-zinc-600">
                            · {p.operation === "add_task" ? "➕" : p.operation === "update_task" ? "✏️" : "·"}{" "}
                            {(p.data as { title?: string })?.title ?? p.taskId ?? p.operation}
                          </p>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => applyPatches(msg.id, msg.patches!)}
                          className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-700 hover:bg-emerald-600/30 transition-colors"
                        >
                          ✓ Toepassen
                        </button>
                        <button
                          onClick={() => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, patchState: "dismissed" } : m))}
                          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-zinc-600 hover:text-zinc-700 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                {[0, 150, 300].map(delay => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 shrink-0">
        <div className="flex gap-2 items-end">
          <button
            onClick={toggleRecording}
            disabled={loading || transcribing}
            title={recording ? "Stop opname" : transcribing ? "Bezig met transcriberen…" : "Spreek je bericht in"}
            aria-label={recording ? "Stop opname" : "Spreek je bericht in"}
            className={`w-9 h-9 flex items-center justify-center rounded-xl shrink-0 text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              recording
                ? "bg-red-600 text-white animate-pulse"
                : transcribing
                ? "bg-gray-200 text-zinc-500"
                : "bg-white border border-gray-200 text-zinc-600 hover:text-zinc-800 hover:border-gray-300"
            }`}
          >
            {transcribing ? "…" : recording ? "⏹" : "🎙️"}
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder={recording ? "Aan het luisteren… spreek je taak in" : "Typ of spreek een bericht in…"}
            rows={1}
            className="flex-1 px-3 py-2 text-sm bg-white text-zinc-900 border border-gray-200 rounded-xl resize-none focus:outline-none focus:border-blue-500/60 placeholder-zinc-600 leading-relaxed"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 text-lg"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
