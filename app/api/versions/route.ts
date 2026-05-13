import { NextRequest, NextResponse } from "next/server";
import { listVersions, getVersion } from "@/lib/storage/versionStorage";

// GET: lijst van versies (zonder content) of één versie met content via ?id=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const version = await getVersion(id);
      if (!version) {
        return NextResponse.json({ error: "Versie niet gevonden" }, { status: 404 });
      }
      return NextResponse.json(version);
    }

    const versions = await listVersions();
    return NextResponse.json({ versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
