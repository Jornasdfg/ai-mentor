import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { CLIENTS, type ClientId } from "./clients";

// Stabiele, geheime deel-tokens per werkgever. Opgeslagen in data/werk_share.json:
//   { "tokens": { "vanvijven": "rens-xxxx", "ledgnd": "ledgnd-yyyy" } }
// De werkgever opent /u/<token> (alleen-lezen). Het token bepaalt welke klant getoond wordt.

function dataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR ? path.resolve(base, process.env.DATA_DIR) : path.join(base, "data");
}
const FILE = () => path.join(dataDir(), "werk_share.json");

interface ShareFile { tokens?: Partial<Record<ClientId, string>>; token?: string; createdAt?: string }

async function readShare(): Promise<Partial<Record<ClientId, string>>> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE(), "utf-8")) as ShareFile;
    const tokens: Partial<Record<ClientId, string>> = { ...(raw.tokens ?? {}) };
    if (raw.token && !tokens.vanvijven) tokens.vanvijven = raw.token; // migratie van oud formaat
    return tokens;
  } catch { return {}; }
}

async function writeShare(tokens: Partial<Record<ClientId, string>>): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify({ tokens, createdAt: new Date().toISOString() }, null, 2), "utf-8");
}

export async function getShareToken(client: ClientId): Promise<string> {
  const tokens = await readShare();
  if (tokens[client]) return tokens[client]!;
  const token = `${CLIENTS[client].slug}-${crypto.randomBytes(3).toString("hex")}`;
  tokens[client] = token;
  await writeShare(tokens);
  return token;
}

// Bepaalt welke klant bij een deel-code hoort (of null als ongeldig).
export async function resolveShareToken(code: string): Promise<ClientId | null> {
  if (!code) return null;
  const tokens = await readShare();
  for (const id of Object.keys(tokens) as ClientId[]) {
    const t = tokens[id];
    if (t && t.length === code.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(code))) return id;
  }
  return null;
}
