import {
  readReceipts, writeReceipts, saveReceiptImage, buildReceipt, newReceiptId,
  findByDedupKey, withReceiptsLock, type Receipt,
} from "./receipts";
import { analyzeReceiptImage } from "./analyzeReceipt";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Bouwt + bewaart een bon/factuur uit een multipart-formulier. Foto optioneel.
// Bij een foto draait AI-analyse en vult ontbrekende velden aan (handmatige invoer wint).
// Met een dedupKey is de import idempotent: bestaat die al, dan wordt niets toegevoegd.
export async function createReceiptFromForm(
  form: FormData,
  source: Receipt["source"]
): Promise<{ receipt: Receipt; duplicate: boolean }> {
  const dedupKey = str(form, "dedupKey");

  // Snelle pre-check (mag buiten de lock): bestaat de dedupKey al, dan klaar.
  if (dedupKey) {
    const pre = findByDedupKey(await readReceipts(), dedupKey);
    if (pre) return { receipt: pre, duplicate: true };
  }

  const photo = form.get("photo") ?? form.get("image") ?? form.get("file");
  let buffer: Buffer | null = null;
  let mime: string | null = null;
  if (photo instanceof Blob && photo.size > 0) {
    if (photo.size > MAX_IMAGE_BYTES) throw new Error("Bestand te groot (max 20MB)");
    mime = photo.type || "image/jpeg";
    buffer = Buffer.from(await photo.arrayBuffer());
  }

  const id = newReceiptId();
  const userGaveDate = !!str(form, "date");
  const userGaveDescription = !!str(form, "description");
  const userGaveDocType = !!str(form, "docType");
  const userGavePayment = !!str(form, "paymentStatus");

  const receipt = buildReceipt(
    id,
    {
      docType: str(form, "docType"),
      description: str(form, "description"),
      merchant: str(form, "merchant"),
      kind: str(form, "kind"),
      amount: str(form, "amount"),
      date: str(form, "date"),
      category: str(form, "category"),
      paymentStatus: str(form, "paymentStatus"),
      sourceUrl: str(form, "sourceUrl"),
      dedupKey,
      note: str(form, "note"),
    },
    source,
    { file: null, mime: null }
  );

  if (buffer && mime) {
    const analysis = await analyzeReceiptImage(buffer, mime);
    if (analysis) {
      receipt.aiAnalyzed = true;
      receipt.aiRaw = analysis.summary;
      if (receipt.amountCents == null) receipt.amountCents = analysis.amountCents;
      if (!receipt.merchant) receipt.merchant = analysis.merchant;
      if (!receipt.category) receipt.category = analysis.category;
      if (receipt.kind === "onbekend") receipt.kind = analysis.kind;
      if (!userGaveDocType && analysis.docType) receipt.docType = analysis.docType;
      if (!userGavePayment && analysis.paymentStatus) receipt.paymentStatus = analysis.paymentStatus;
      if (!userGaveDate && analysis.date) receipt.date = analysis.date;
      if (!userGaveDescription && analysis.summary) receipt.description = analysis.summary;
    }
    const file = await saveReceiptImage(id, buffer, mime);
    receipt.imageFile = file;
    receipt.imageMime = mime;
  }

  // iPhone-bonnen (en gmail-bonnen) zijn vrijwel altijd zakelijk → default zakelijk
  // i.p.v. onbekend/privé wanneer er geen expliciete keuze is gemaakt.
  if (source !== "manual" && receipt.kind === "onbekend") receipt.kind = "zakelijk";

  receipt.updatedAt = new Date().toISOString();

  // Onder lock: opnieuw lezen, definitieve dedup, toevoegen, schrijven.
  // Voorkomt dat gelijktijdige uploads elkaars schrijfactie overschrijven.
  return withReceiptsLock(async () => {
    const all = await readReceipts();
    const existing = findByDedupKey(all, dedupKey);
    if (existing) return { receipt: existing, duplicate: true };
    all.unshift(receipt);
    await writeReceipts(all);
    return { receipt, duplicate: false };
  });
}
