import { google } from "googleapis";
// Directe lib-entry i.p.v. "pdf-parse" (de index.js voert debug-code uit die een
// testbestand probeert te lezen wanneer module.parent ontbreekt).
import pdf from "pdf-parse/lib/pdf-parse.js";
import { readGoogleTokens, writeGoogleTokens } from "@/lib/calendar/googleTokenStorage";
import { addCost } from "@/lib/storage/costStorage";
import {
  parseAmountToCents, normalizeKind, normalizeDocType, normalizePaymentStatus,
  type ReceiptKind, type DocType, type PaymentStatus,
} from "./receipts";

// Haalt een factuur-PDF (bijlage) uit Gmail op met het Gmail-leesrecht van de app,
// leest de TEKST uit de PDF en parset het bedrag/winkel/datum. Vimexx-achtige
// facturen zijn tekst-PDF's → betrouwbaar te lezen.

async function gmailAuth() {
  const tokens = await readGoogleTokens();
  if (!tokens?.connected || !tokens.refreshToken) {
    throw new Error("Google is niet gekoppeld (of zonder Gmail-recht). Koppel opnieuw via /api/auth/google/start.");
  }
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI
  );
  oauth2.setCredentials({
    access_token: tokens.accessToken, refresh_token: tokens.refreshToken, expiry_date: tokens.expiryDate,
  });
  oauth2.on("tokens", (c) => {
    readGoogleTokens().then(cur => {
      if (!cur) return;
      writeGoogleTokens({ ...cur, accessToken: c.access_token ?? cur.accessToken, expiryDate: c.expiry_date ?? cur.expiryDate, updatedAt: new Date().toISOString() }).catch(() => {});
    }).catch(() => {});
  });
  return oauth2;
}

interface GmailPart { filename?: string | null; mimeType?: string | null; body?: { attachmentId?: string | null } | null; parts?: GmailPart[] }
function findPdfPart(part: GmailPart | undefined): { attachmentId: string; filename: string } | null {
  if (!part) return null;
  const isPdf = (part.mimeType === "application/pdf") || (!!part.filename && /\.pdf$/i.test(part.filename));
  if (isPdf && part.body?.attachmentId) return { attachmentId: part.body.attachmentId, filename: part.filename || "factuur.pdf" };
  for (const p of part.parts ?? []) {
    const found = findPdfPart(p);
    if (found) return found;
  }
  return null;
}

export interface FetchedPdf { buffer: Buffer; filename: string }

// Haalt de eerste PDF-bijlage uit een Gmail-bericht.
export async function fetchInvoicePdf(messageId: string, attachmentId?: string | null): Promise<FetchedPdf | null> {
  const gmail = google.gmail({ version: "v1", auth: await gmailAuth() });
  let attId = attachmentId || null;
  let filename = "factuur.pdf";
  if (!attId) {
    const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
    const found = findPdfPart(msg.data.payload as GmailPart | undefined);
    if (!found) return null;
    attId = found.attachmentId; filename = found.filename;
  }
  const att = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attId });
  const data = att.data.data;
  if (!data) return null;
  return { buffer: Buffer.from(data, "base64"), filename }; // Gmail geeft base64url; Buffer 'base64' decodeert dit ook
}

export interface PdfInvoiceFields {
  merchant: string | null;
  amountCents: number | null;
  date: string | null;
  docType: DocType;
  kind: ReceiptKind;
  paymentStatus: PaymentStatus;
  summary: string | null;
}

const IN = 0.15 / 1e6, OUT = 0.60 / 1e6; // gpt-4o-mini (tekst)
const SYSTEM = `Je bent een nauwkeurige facturen-parser. Hieronder staat de UITGELEZEN TEKST van een factuur-PDF.
Geef UITSLUITEND JSON terug:
{"merchant":"leverancier of null","amount":"EINDTOTAAL incl. btw als NL-tekst bv 12,50, of null","date":"YYYY-MM-DD of null","docType":"factuur","kind":"zakelijk of prive","paymentStatus":"betaald of openstaand of onbekend","summary":"1 korte zin"}
Pak het EINDTOTAAL/te betalen bedrag (incl. btw), niet een subtotaal of los btw-bedrag. Lees cijfers exact (NL komma als decimaal).`;

// Parset de PDF-tekst naar factuurvelden via een goedkoop tekstmodel.
export async function parseInvoicePdf(buffer: Buffer): Promise<PdfInvoiceFields | null> {
  let text = "";
  try {
    const parsed = await pdf(buffer);
    text = (parsed.text || "").trim();
  } catch {
    return null;
  }
  if (!text) return null;
  // Beperk lengte (facturen zijn kort; bespaart tokens).
  const snippet = text.slice(0, 6000);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: snippet },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const inTok = json.usage?.prompt_tokens ?? 0, outTok = json.usage?.completion_tokens ?? 0;
    if (inTok || outTok) await addCost(inTok, outTok, inTok * IN + outTok * OUT).catch(() => {});
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const p = JSON.parse(content) as Record<string, string | null>;
    const date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
    return {
      merchant: p.merchant?.toString().trim() || null,
      amountCents: parseAmountToCents(p.amount),
      date,
      docType: normalizeDocType(p.docType || "factuur"),
      kind: normalizeKind(p.kind),
      paymentStatus: normalizePaymentStatus(p.paymentStatus),
      summary: p.summary?.toString().trim() || null,
    };
  } catch {
    return null;
  }
}
