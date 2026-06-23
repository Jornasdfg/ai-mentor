import { NextRequest, NextResponse } from "next/server";
import { readFreight, readWerkImage } from "@/lib/werk/workStore";

export const runtime = "nodejs";

// Serveert de vrachtbon-foto uit de werk-images map.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = (await readFreight()).find(x => x.id === id);
  if (!v || !v.imageFile) return new NextResponse("Niet gevonden", { status: 404 });
  const buf = await readWerkImage(v.imageFile);
  if (!buf) return new NextResponse("Niet gevonden", { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: { "Content-Type": v.imageMime || "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
