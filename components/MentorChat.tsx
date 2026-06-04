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
  const [levels, setLevels] = useState<number[]>([]);   // live geluidsgolf (0..1 per balkje)
  const [elapsedMs, setElapsedMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelRef = useRef(false);

  const WAVE_BARS = 28;

  function fmtTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function teardownAudio() {
    if (meterRef.current) { clearInterval(meterRef.current); meterRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  // Stop opname; verstuur (send=true) of gooi weg (send=false).
  function stopRecording(send: boolean) {
    cancelRef.current = !send;
    mediaRecorderRef.current?.stop();
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      cancelRef.current = false;
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const recMime = rec.mimeType || mime || "audio/webm";
        teardownAudio();
        setRecording(false);
        setLevels([]);
        const blob = new Blob(chunksRef.current, { type: recMime });
        if (cancelRef.current || blob.size === 0) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          const fileName = recMime.includes("mp4") ? "audio.m4a" : "audio.webm";
          fd.append("audio", blob, fileName);
          fd.append("durationMs", String(Date.now() - recordStartRef.current));
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json() as { text?: string; error?: string };
          if (!res.ok) throw new Error(data.error ?? "Transcriptie mislukt");
          const text = (data.text ?? "").trim();
          // ChatGPT-stijl: na opname meteen transcriberen én versturen.
          if (text) {
            const combined = (input ? input.trim() + " " : "") + text;
            setInput("");
            await handleSend(combined);
          }
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
      setElapsedMs(0);
      setLevels(new Array(WAVE_BARS).fill(0.05));

      // Live geluidsgolf via Web Audio analyser.
      try {
        const AC: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        meterRef.current = window.setInterval(() => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length / 255;            // 0..1
          const level = Math.min(1, Math.max(0.05, avg * 1.9));
          setLevels(prev => [...prev.slice(1), level]);
        }, 70);
      } catch { /* meter optioneel */ }

      timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - recordStartRef.current), 200);
    } catch {
      setError("Geen toegang tot microfoon — sta microfoon toe in je browser.");
    }
  }

  // Opruimen bij unmount.
  useEffect(() => () => teardownAudio(), []);

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
        {recording ? (
          /* ── Opname-modus (ChatGPT-stijl): annuleren · live geluidsgolf · stop & verstuur ── */
          <div className="flex items-center gap-2">
            <button
              onClick={() => stopRecording(false)}
              aria-label="Opname annuleren"
              title="Annuleren"
              className="w-11 h-11 flex items-center justify-center rounded-full border border-gray-200 bg-white text-zinc-500 hover:text-red-600 hover:border-red-300 transition-colors shrink-0 text-lg"
            >
              ✕
            </button>

            <div className="flex-1 h-11 rounded-full bg-white border border-red-200 flex items-center gap-2 px-3 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <div className="flex-1 flex items-center justify-center gap-[2px] h-full overflow-hidden">
                {levels.map((l, i) => (
                  <span
                    key={i}
                    style={{ height: `${Math.round(5 + l * 26)}px` }}
                    className="w-[3px] rounded-full bg-red-400 transition-[height] duration-75 ease-out shrink-0"
                  />
                ))}
              </div>
              <span className="text-[11px] tabular-nums text-zinc-500 shrink-0 w-9 text-right">{fmtTime(elapsedMs)}</span>
            </div>

            <button
              onClick={() => stopRecording(true)}
              aria-label="Stop opname en verstuur"
              title="Stop & verstuur"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-red-600 text-white shrink-0 shadow-lg shadow-red-500/30 animate-record-pulse"
            >
              <span className="block w-3.5 h-3.5 rounded-[3px] bg-white" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <button
              onClick={startRecording}
              disabled={loading || transcribing}
              title={transcribing ? "Bezig met transcriberen…" : "Spreek je bericht in"}
              aria-label="Spreek je bericht in"
              className={`w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center rounded-full shrink-0 text-lg transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed ${
                transcribing
                  ? "bg-gray-200 text-zinc-500"
                  : "bg-white border border-gray-200 text-zinc-600 hover:text-zinc-800 hover:border-gray-300"
              }`}
            >
              {transcribing ? "…" : "🎙️"}
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={transcribing ? "Transcriberen…" : "Typ of spreek een bericht in…"}
              rows={1}
              disabled={transcribing}
              className="flex-1 px-3 py-2 text-sm bg-white text-zinc-900 border border-gray-200 rounded-xl resize-none focus:outline-none focus:border-blue-500/60 placeholder-zinc-600 leading-relaxed disabled:opacity-60"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 text-lg"
            >
              ↑
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
