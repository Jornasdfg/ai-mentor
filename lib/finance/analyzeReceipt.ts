import { addCost } from "@/lib/storage/costStorage";
import {
  parseAmountToCents, normalizeKind, normalizeDocType, normalizePaymentStatus,
  type ReceiptKind, type DocType, type PaymentStatus,
} from "./receipts";

// AI-analyse van een bon/factuur-foto met een goedkoop vision-model (gpt-4o-mini, detail:"low").
// Kosten ~fractie cent per bon; worden in de kostenteller gelogd.
// Vult ontbrekende velden aan — handmatige invoer van de gebruiker heeft voorrang.

export interface ReceiptAnalysis {
  merchant: string | null;
  amountCents: number | null;
  date: string | null;        // YYYY-MM-DD
  category: string | null;
  kind: ReceiptKind;
  docType: DocType;
  paymentStatus: PaymentStatus;
  summary: string | null;
}

// gpt-4o-mini prijs (USD per token)
const IN_PER_TOKEN = 0.15 / 1_000_000;
const OUT_PER_TOKEN = 0.60 / 1_000_000;

const SYSTEM = `Je bent een nauwkeurige bonnen- en facturen-scanner voor een Nederlandse administratie.
Analyseer de afbeelding en geef UITSLUITEND JSON terug:
{
  "docType": "bon of factuur (kassabon=bon; factuur/nota/rekening met factuurnummer=factuur)",
  "merchant": "naam winkel/leverancier of null",
  "amount": "totaalbedrag als string, bv. 12,50 (gebruik het EINDTOTAAL incl. btw) of null",
  "date": "YYYY-MM-DD of null",
  "category": "korte categorie: Boodschappen, Horeca, Reizen, Software, Kantoor, Brandstof, Overig",
  "kind": "zakelijk of prive (gok op basis van het type aankoop; bij twijfel prive)",
  "paymentStatus": "betaald (kassabon/pinbon = betaald) of openstaand (factuur 'te betalen') of onbekend",
  "summary": "1 korte zin wat er gekocht is"
}
Lees het eindtotaal, niet een subtotaal of btw-bedrag. Geen extra tekst buiten de JSON.`;

export async function analyzeReceiptImage(
  buffer: Buffer,
  mime: string
): Promise<ReceiptAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  // HEIC kan het model niet betrouwbaar lezen; sla analyse over (Shortcut levert JPEG aan).
  if (mime.includes("heic") || mime.includes("heif")) return null;

  const model = process.env.RECEIPTS_VISION_MODEL || "gpt-4o-mini";
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyseer deze bon." },
              { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const json = await res.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const inTok = json.usage?.prompt_tokens ?? 0;
    const outTok = json.usage?.completion_tokens ?? 0;
    if (inTok || outTok) {
      await addCost(inTok, outTok, inTok * IN_PER_TOKEN + outTok * OUT_PER_TOKEN).catch(() => {});
    }

    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      docType?: string | null; merchant?: string | null; amount?: string | null; date?: string | null;
      category?: string | null; kind?: string | null; paymentStatus?: string | null; summary?: string | null;
    };

    const date = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
    return {
      merchant: parsed.merchant?.toString().trim() || null,
      amountCents: parseAmountToCents(parsed.amount),
      date,
      category: parsed.category?.toString().trim() || null,
      kind: normalizeKind(parsed.kind),
      docType: normalizeDocType(parsed.docType),
      paymentStatus: normalizePaymentStatus(parsed.paymentStatus),
      summary: parsed.summary?.toString().trim() || null,
    };
  } catch {
    return null;
  }
}
