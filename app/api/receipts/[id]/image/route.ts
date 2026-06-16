import { NextRequest, NextResponse } from "next/server";
import { readReceipts, readReceiptImage } from "@/lib/finance/receipts";

export const runtime = "nodejs";

// Serveert de bonfoto vanuit de data-volume (foto's staan buiten /public).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipts = await readReceipts();
  const r = receipts.find(x => x.id === id);
  if (!r || !r.imageFile) return new NextResponse("Niet gevonden", { status: 404 });

  const buf = await readReceiptImage(r.imageFile);
  if (!buf) return new NextResponse("Niet gevonden", { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": r.imageMime || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
