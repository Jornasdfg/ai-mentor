import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// Stabiel, geheim deel-token voor de werkgever-link. Opgeslagen in data/ zodat er
// geen env-herstart nodig is. De werkgever opent /werk/<token> (alleen-lezen).

function dataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR ? path.resolve(base, process.env.DATA_DIR) : path.join(base, "data");
}
const FILE = () => path.join(dataDir(), "werk_share.json");

export async function getShareToken(): Promise<string> {
  try {
    const raw = await fs.readFile(FILE(), "utf-8");
    const t = JSON.parse(raw) as { token?: string };
    if (t.token) return t.token;
  } catch { /* nog niet aangemaakt */ }
  const token = "vv_" + crypto.randomBytes(18).toString("hex");
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(FILE(), JSON.stringify({ token, createdAt: new Date().toISOString() }, null, 2), "utf-8");
  return token;
}

export async function isValidShareToken(token: string): Promise<boolean> {
  if (!token) return false;
  const real = await getShareToken();
  // constant-time vergelijk
  const a = Buffer.from(token), b = Buffer.from(real);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
