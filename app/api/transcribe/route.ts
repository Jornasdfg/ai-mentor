import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

export const runtime = "nodejs";

// Goedkope spraak→tekst via OpenAI Whisper (whisper-1, ~$0.006/min).
// Ontvangt audio (multipart form, veld "audio") en geeft de transcriptie terug.
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
    const buf = Buffer.from(await audio.arrayBuffer());
    const file = await toFile(buf, "audio.webm", { type: audio.type || "audio/webm" });

    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "nl",
    });

    return NextResponse.json({ text: result.text ?? "" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcriptie mislukt" },
      { status: 500 }
    );
  }
}
