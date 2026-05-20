import fs from "fs/promises";
import path from "path";
import type { ScheduleBlock, ScheduleRun, SchedulingWindow } from "../mentorTypes";

function getDataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR ? path.resolve(base, process.env.DATA_DIR) : path.join(base, "data");
}
function filePath(name: string): string { return path.join(getDataDir(), name); }
async function ensureDir(): Promise<void> { await fs.mkdir(getDataDir(), { recursive: true }); }

export async function readScheduleBlocks(): Promise<ScheduleBlock[]> {
  try { return JSON.parse(await fs.readFile(filePath("schedule_blocks.json"), "utf-8")) as ScheduleBlock[]; } catch { return []; }
}
export async function writeScheduleBlocks(blocks: ScheduleBlock[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath("schedule_blocks.json"), JSON.stringify(blocks, null, 2), "utf-8");
}
export async function removeBlocksForTask(taskId: string): Promise<void> {
  const blocks = await readScheduleBlocks();
  await writeScheduleBlocks(blocks.filter(b => b.taskId !== taskId));
}

export async function readScheduleRuns(): Promise<ScheduleRun[]> {
  try { return JSON.parse(await fs.readFile(filePath("schedule_runs.json"), "utf-8")) as ScheduleRun[]; } catch { return []; }
}
export async function writeScheduleRuns(runs: ScheduleRun[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath("schedule_runs.json"), JSON.stringify(runs, null, 2), "utf-8");
}

export async function readSchedulingWindows(): Promise<SchedulingWindow[]> {
  try { return JSON.parse(await fs.readFile(filePath("scheduling_windows.json"), "utf-8")) as SchedulingWindow[]; } catch { return []; }
}
export async function writeSchedulingWindows(windows: SchedulingWindow[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath("scheduling_windows.json"), JSON.stringify(windows, null, 2), "utf-8");
}
export async function ensureDefaultSchedulingWindows(): Promise<void> {
  const existing = await readSchedulingWindows();
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  await writeSchedulingWindows([
    { id: "window_work",    name: "Werk",    type: "work",     daysOfWeek: [1,2,3,4,5], startTime: "09:00", endTime: "17:30", isActive: true, createdAt: now, updatedAt: now },
    { id: "window_evening", name: "Avond",   type: "personal", daysOfWeek: [1,2,3,4,5], startTime: "19:00", endTime: "22:00", isActive: true, createdAt: now, updatedAt: now },
    { id: "window_weekend", name: "Weekend", type: "personal", daysOfWeek: [6,7],        startTime: "10:00", endTime: "17:00", isActive: true, createdAt: now, updatedAt: now },
  ]);
}