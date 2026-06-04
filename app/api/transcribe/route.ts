import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { addCost } from "@/lib/storage/costStorage";

export const runtime = "nodejs";

// Kosten per minuut audio. gpt-4o-mini-transcribe is nauwkeuriger én goedkoper dan whisper-1.
const COST_PER_MINUTE: Record<string, number> = {
  "gpt-4o-mini-transcribe": 0.003,
  "whisper-1": 0.006,
};

// Domein-hint: stuurt Whisper naar correcte Nederlandse termen/namen (spelling).
const NL_PROMPT =
  "Transcriptie voor een Nederlandse productiviteits-app. Veelvoorkomende woorden: taak, routine, " +
  "afspraak, deadline, planning, agenda, factuur, prioriteit, project, Reishacker, Boone Media, " +
  "Malaga, Weeze, affiliate, Airtable, P0, P1, P2, maandag, volgende week.";

// Kies bestandsnaam-extensie op basis van het echte mime-type, zodat OpenAI het formaat
// correct herkent (cruciaal voor iOS/Safari die audio/mp4 opneemt, niet webm).
function fileNameForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "audio.m4a";
  if (m.includes("ogg")) return "audio.ogg";
  if (m.includes("wav")) return "audio.wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "audio.mp3";
  return "audio.webm";
}

// Goedkope spraak→tekst. Ontvangt audio (multipart form, veld "audio") en geeft de transcriptie terug.
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY ontbreekt" }, { status: 500 });
    }

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Geen audio ontvangen" }, { status: 400 });
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: "Lege opname" }, { status: 400 });
    }
    if (audio.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio te groot (max 25MB)" }, { status: 413 });
    }

    const openai = new OpenAI({ apiKey });
    const mime = audio.type || "audio/webm";
    const buf = Buffer.from(await audio.arrayBuffer());

    async function transcribeWith(model: string): Promise<string> {
      const file = await toFile(buf, fileNameForMime(mime), { type: mime });
      const result = await openai.audio.transcriptions.create({
        file,
        model,
        language: "nl",
        prompt: NL_PROMPT,
      });
      return result.text ?? "";
    }

    // Primair het accuratere/goedkopere model; val terug op whisper-1 als het niet beschikbaar is.
    let usedModel = "gpt-4o-mini-transcribe";
    let text: string;
    try {
      text = await transcribeWith(usedModel);
    } catch {
      usedModel = "whisper-1";
      text = await transcribeWith(usedModel);
    }

    const durationMs = Number(form.get("durationMs")) || 0;
    const seconds = durationMs > 0 ? durationMs / 1000 : 0;
    const costUSD = (Math.max(seconds, 1) / 60) * (COST_PER_MINUTE[usedModel] ?? 0.006);
    addCost(0, 0, costUSD).catch(() => {});

    return NextResponse.json({ text, costUSD });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcriptie mislukt" },
      { status: 500 }
    );
  }
}
