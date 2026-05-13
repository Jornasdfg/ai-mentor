import * as fs from "fs/promises";
import * as path from "path";
import { readTasks } from "@/lib/mentor/mentorStorage";
import { readConflicts } from "@/lib/calendar/googleConflictStorage";
import { readEventCache } from "@/lib/calendar/googleSyncStorage";
import { getAIClient } from "@/lib/ai/modelRouter";
import { sendNotification } from "@/lib/notifications";

const DATA_DIR = path.join(process.cwd(), "data");
const BRIEFINGS_FILE = path.join(DATA_DIR, "daily_briefings.json");

export interface DailyBriefingRecord {
  id: string;
  date: string;
  content: string;
  taskCount: number;
  conflictCount: number;
  sentVia: string;
  createdAt: string;
}

async function readBriefings(): Promise<DailyBriefingRecord[]> {
  try {
    const raw = await fs.readFile(BRIEFINGS_FILE, "utf-8");
    return (JSON.parse(raw) as { briefings: DailyBriefingRecord[] }).briefings ?? [];
  } catch {
    return [];
  }
}

async function saveBriefing(record: DailyBriefingRecord): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const briefings = await readBriefings();
  briefings.unshift(record);
  if (briefings.length > 90) briefings.splice(90);
  await fs.writeFile(BRIEFINGS_FILE, JSON.stringify({ briefings }, null, 2), "utf-8");
}

export async function getRecentBriefings(limit = 7): Promise<DailyBriefingRecord[]> {
  const briefings = await readBriefings();
  return briefings.slice(0, limit);
}

export async function generateDailyBriefing(): Promise<DailyBriefingRecord> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tz = "Europe/Amsterdam";
  const todayNL = now.toLocaleDateString("nl-NL", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });

  // ── Data collection ──────────────────────────────────────────────────────────
  const [allTasks, conflicts, cachedEvents] = await Promise.all([
    readTasks(),
    readConflicts().catch(() => []),
    readEventCache().catch(() => []),
  ]);

  const openTasks = allTasks.filter(t => t.status === "open" || t.status === "in_progress");
  const p0p1 = openTasks.filter(t => t.priority === "P0" || t.priority === "P1");

  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const upcoming = openTasks.filter(t => {
    const d = t.hardDeadline ?? t.softDeadline ?? t.plannedDate ?? null;
    return d && d >= today && d <= sevenDaysOut;
  });

  const todayEvents = cachedEvents.filter(e => {
    if (e.status === "cancelled") return false;
    return e.start.slice(0, 10) === today || e.end.slice(0, 10) === today;
  });

  const openConflicts = conflicts.filter(c => c.status === "open");

  // ── Build context for AI ──────────────────────────────────────────────────────
  const taskLines = p0p1.slice(0, 10).map(t =>
    `- [${t.priority}] ${t.title}${t.hardDeadline ? ` (deadline: ${t.hardDeadline})` : ""}`
  ).join("\n");

  const eventLines = todayEvents.slice(0, 8).map(e =>
    `- ${e.summary} (${e.start.slice(11, 16) || "hele dag"})`
  ).join("\n");

  const upcomingLines = upcoming.slice(0, 6).map(t =>
    `- ${t.title} — ${t.hardDeadline ?? t.softDeadline ?? t.plannedDate}`
  ).join("\n");

  const conflictLines = openConflicts.slice(0, 5).map(c =>
    `- Taak ${c.taskId}: ${c.googleEventSnapshot.summary ?? "event"} (detected ${c.detectedAt.slice(0, 10)})`
  ).join("\n");

  const systemPrompt = `Je bent een persoonlijke AI-mentor. Genereer een beknopte dagelijkse briefing in het Nederlands.
Schrijf in de tweede persoon (jij/je). Wees direct en actiegericht. Gebruik Markdown met secties.
Maximaal 400 woorden.`;

  const userMessage = `Vandaag is het ${todayNL}.

OPEN TAKEN HOGE PRIORITEIT (P0/P1):
${taskLines || "Geen P0/P1 taken."}

AGENDA VANDAAG:
${eventLines || "Geen agendapunten gevonden."}

DEADLINES KOMENDE 7 DAGEN:
${upcomingLines || "Geen aankomende deadlines."}

OPEN KALENDER CONFLICTEN:
${conflictLines || "Geen conflicten."}

STATISTIEKEN:
- ${openTasks.length} open taken totaal
- ${p0p1.length} hoge prioriteit (P0/P1)
- ${openConflicts.length} onopgeloste conflicten

Genereer een briefing met: ## Goedemorgen, ## Vandaag, ## Deadlines deze week, ## Actie vereist (alleen als er conflicten/issues zijn).`;

  const ai = getAIClient();
  const result = await ai.complete(systemPrompt, userMessage);
  const content = result.text;

  // ── Send notifications ────────────────────────────────────────────────────────
  const sentVia = await sendNotification(
    `AI Mentor briefing — ${todayNL}`,
    content,
    { tags: ["calendar", "briefing"], priority: 3 }
  );

  // ── Save record ───────────────────────────────────────────────────────────────
  const record: DailyBriefingRecord = {
    id: `briefing_${Date.now()}`,
    date: today,
    content,
    taskCount: openTasks.length,
    conflictCount: openConflicts.length,
    sentVia: sentVia.join(",") || "none",
    createdAt: now.toISOString(),
  };
  await saveBriefing(record);
  return record;
}
