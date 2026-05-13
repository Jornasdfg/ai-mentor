import fs from "fs/promises";
import path from "path";

interface CostRecord {
  totalCostUSD: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastUpdated: string;
}

function getCostPath(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  const dataDir = process.env.DATA_DIR
    ? path.resolve(base, process.env.DATA_DIR)
    : path.join(base, "data");
  return path.join(dataDir, "cost.json");
}

async function readCost(): Promise<CostRecord> {
  try {
    const raw = await fs.readFile(getCostPath(), "utf-8");
    return JSON.parse(raw) as CostRecord;
  } catch {
    return { totalCostUSD: 0, totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, lastUpdated: new Date().toISOString() };
  }
}

export async function addCost(inputTokens: number, outputTokens: number, costUSD: number): Promise<CostRecord> {
  const current = await readCost();
  const updated: CostRecord = {
    totalCostUSD: current.totalCostUSD + costUSD,
    totalCalls: current.totalCalls + 1,
    totalInputTokens: current.totalInputTokens + inputTokens,
    totalOutputTokens: current.totalOutputTokens + outputTokens,
    lastUpdated: new Date().toISOString(),
  };
  const costPath = getCostPath();
  await fs.mkdir(path.dirname(costPath), { recursive: true });
  await fs.writeFile(costPath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export async function getCostSummary(): Promise<CostRecord> {
  return readCost();
}

export async function resetCost(): Promise<void> {
  const zero: CostRecord = { totalCostUSD: 0, totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, lastUpdated: new Date().toISOString() };
  const costPath = getCostPath();
  await fs.mkdir(path.dirname(costPath), { recursive: true });
  await fs.writeFile(costPath, JSON.stringify(zero, null, 2), "utf-8");
}
