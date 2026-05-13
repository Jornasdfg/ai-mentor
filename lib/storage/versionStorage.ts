import fs from "fs/promises";
import path from "path";
import type { ReferenceVersion } from "../mentorTypes";

function getVersionsDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  const dataDir = process.env.DATA_DIR
    ? path.resolve(base, process.env.DATA_DIR)
    : path.join(base, "data");
  return path.join(dataDir, "versions");
}

function getIndexPath(): string {
  return path.join(getVersionsDir(), "index.json");
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(getVersionsDir(), { recursive: true });
}

async function readIndex(): Promise<ReferenceVersion[]> {
  try {
    const raw = await fs.readFile(getIndexPath(), "utf-8");
    return JSON.parse(raw) as ReferenceVersion[];
  } catch {
    return [];
  }
}

async function writeIndex(versions: ReferenceVersion[]): Promise<void> {
  await fs.writeFile(getIndexPath(), JSON.stringify(versions, null, 2), "utf-8");
}

export async function saveVersion(content: string): Promise<ReferenceVersion> {
  await ensureDirs();

  const now = new Date();
  const id = now.toISOString();
  const label = now.toLocaleString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const filename = `${id.replace(/[:.]/g, "-")}.md`;
  await fs.writeFile(path.join(getVersionsDir(), filename), content, "utf-8");

  const version: ReferenceVersion = { id, label, content, savedAt: id };

  const versions = await readIndex();
  versions.unshift(version);
  if (versions.length > 50) versions.splice(50);
  await writeIndex(versions);

  return version;
}

export async function listVersions(): Promise<Omit<ReferenceVersion, "content">[]> {
  const versions = await readIndex();
  return versions.map(({ id, label, savedAt }) => ({ id, label, savedAt }));
}

export async function getVersion(id: string): Promise<ReferenceVersion | null> {
  const versions = await readIndex();
  return versions.find((v) => v.id === id) ?? null;
}
