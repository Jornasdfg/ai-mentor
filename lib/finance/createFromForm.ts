import {
  readReceipts, writeReceipts, saveReceiptImage, buildReceipt, newReceiptId,
  type Receipt,
} from "./receipts";
import { analyzeReceiptImage } from "./analyzeReceipt";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Bouwt + bewaart een bon uit een multipart-formulier. Foto optioneel.
// Bij een foto draait AI-analyse en vult ontbrekende velden aan (handmatige invoer wint).
export async function createReceiptFromForm(
  form: FormData,
  source: Receipt["source"]
): Promise<Receipt> {
  const photo = form.get("photo") ?? form.get("image") ?? form.get("file");

  let buffer: Buffer | null = null;
  let mime: string | null = null;
  if (photo instanceof Blob && photo.size > 0) {
    if (photo.size > MAX_IMAGE_BYTES) throw new Error("Foto te groot (max 20MB)");
    mime = photo.type || "image/jpeg";
    buffer = Buffer.from(await photo.arrayBuffer());
  }

  const id = newReceiptId();
  const userGaveDate = !!str(form, "date");
  const userGaveDescription = !!str(form, "description");

  const receipt = buildReceipt(
    id,
    {
      description: str(form, "description"),
      merchant: str(form, "merchant"),
      kind: str(form, "kind"),
      amount: str(form, "amount"),
      date: str(form, "date"),
      category: str(form, "category"),
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
      if (!userGaveDate && analysis.date) receipt.date = analysis.date;
      if (!userGaveDescription && analysis.summary) receipt.description = analysis.summary;
    }
    const file = await saveReceiptImage(id, buffer, mime);
    receipt.imageFile = file;
    receipt.imageMime = mime;
  }

  receipt.updatedAt = new Date().toISOString();
  const all = await readReceipts();
  all.unshift(receipt);
  await writeReceipts(all);
  return receipt;
}
