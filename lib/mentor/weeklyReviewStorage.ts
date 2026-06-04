import fs from "fs/promises";
import path from "path";
import type { WeeklyReview } from "../mentorTypes";

function getDataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR
    ? path.resolve(base, process.env.DATA_DIR)
    : path.join(base, "data");
}

function filePath(): string {
  return path.join(getDataDir(), "weekly_review.json");
}

export async function readWeeklyReview(): Promise<WeeklyReview | null> {
  try {
    const raw = await fs.readFile(filePath(), "utf-8");
    return JSON.parse(raw) as WeeklyReview;
  } catch {
    return null;
  }
}

export async function writeWeeklyReview(review: WeeklyReview): Promise<void> {
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.writeFile(filePath(), JSON.stringify(review, null, 2), "utf-8");
}

// Compacte, token-zuinige snippet voor de mentor-systemprompt.
// Alleen meegegeven als de review vers genoeg is (binnen `maxAgeDays`), zodat de
// mentor niet over een verouderde week praat. Geeft "" als er niets relevants is.
export function buildWeeklyReviewSnippet(review: WeeklyReview | null, maxAgeDays = 9): string {
  if (!review) return "";
  const gen = new Date(review.generatedAt).getTime();
  if (!Number.isFinite(gen)) return "";
  const ageDays = (Date.now() - gen) / 86_400_000;
  if (ageDays > maxAgeDays) return "";

  const lines: string[] = [`Weekanalyse (${review.weekStart}–${review.weekEnd}): ${review.summary.trim()}`];
  const focus = (review.focusNextWeek ?? []).slice(0, 3).map(f => f.trim()).filter(Boolean);
  if (focus.length) lines.push(`Focus deze week: ${focus.join("; ")}`);
  return lines.join("\n");
}
