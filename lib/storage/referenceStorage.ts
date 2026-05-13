import fs from "fs/promises";
import path from "path";

function getDataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR
    ? path.resolve(base, process.env.DATA_DIR)
    : path.join(base, "data");
}

function getReferencePath(): string {
  return path.join(getDataDir(), "daily_reference.md");
}

export async function readReference(): Promise<string> {
  try {
    return await fs.readFile(getReferencePath(), "utf-8");
  } catch {
    return "";
  }
}

export async function writeReference(content: string): Promise<void> {
  const dataDir = getDataDir();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(getReferencePath(), content, "utf-8");
}
