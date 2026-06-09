import fs from "fs/promises";
import path from "path";
import { readTasks } from "@/lib/mentor/mentorStorage";
import { readScheduleBlocks } from "@/lib/scheduler/scheduleStorage";
import { sendPushToAll, pushConfigured } from "./webPush";
import type { MentorTask } from "@/lib/mentorTypes";

interface NotifyState {
  initialized: boolean;
  notifiedBlockKeys: string[];
  lastDeadlineDate: string | null;
  seenMailTaskIds: string[];
}

function dir(): string {
  const base = process.cwd();
  return process.env.DATA_DIR ? path.resolve(base, process.env.DATA_DIR) : path.join(base, "data");
}
function stateFile(): string {
  return path.join(dir(), "notify_state.json");
}
async function readState(): Promise<NotifyState> {
  try {
    return JSON.parse(await fs.readFile(stateFile(), "utf-8")) as NotifyState;
  } catch {
    return { initialized: false, notifiedBlockKeys: [], lastDeadlineDate: null, seenMailTaskIds: [] };
  }
}
async function writeState(s: NotifyState): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(stateFile(), JSON.stringify(s, null, 2), "utf-8");
}

function amsNow(): { date: string; hour: number; nowMs: number } {
  const wall = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" }); // "YYYY-MM-DD HH:mm:ss"
  const [date, time] = wall.split(" ");
  return { date, hour: Number(time.slice(0, 2)), nowMs: new Date(wall.replace(" ", "T")).getTime() };
}
const fmtTime = (dt: string) => dt.slice(11, 16);
const deadlineOf = (t: MentorTask) => t.hardDeadline ?? t.deadline ?? null;

// Draait elke minuut in de worker. Stuurt drie soorten meldingen, met dedup via notify_state.
export async function runReminders(): Promise<void> {
  if (!pushConfigured()) return;
  const [tasks, blocks, state] = await Promise.all([readTasks(), readScheduleBlocks(), readState()]);
  const { date: today, hour, nowMs } = amsNow();
  let changed = false;

  // Eerste run: bestaande mail-taken als "gezien" markeren (geen achterstand-spam).
  if (!state.initialized) {
    state.seenMailTaskIds = tasks.filter(t => t.source === "mail").map(t => t.id);
    state.initialized = true;
    changed = true;
  }

  // 1) ~10 min vóór een vaste/bevestigde blok (afspraak of vastgezette taak).
  for (const b of blocks) {
    const committed = b.locked === true || b.source !== "auto_scheduler";
    if (!committed) continue;
    const key = `${b.taskId}@${b.start}`;
    if (state.notifiedBlockKeys.includes(key)) continue;
    const diffMin = (new Date(b.start).getTime() - nowMs) / 60000;
    if (diffMin >= -1 && diffMin <= 11) {
      const when = Math.max(0, Math.round(diffMin));
      await sendPushToAll({
        title: when <= 1 ? "⏰ Begint nu" : `⏰ Over ${when} min`,
        body: `${b.title} — ${fmtTime(b.start)}`,
        url: "/", tag: `block-${key}`,
      });
      state.notifiedBlockKeys.push(key);
      changed = true;
    }
  }
  if (state.notifiedBlockKeys.length > 300) {
    state.notifiedBlockKeys = state.notifiedBlockKeys.slice(-200);
    changed = true;
  }

  // 2) Nieuwe taken uit de mail-routine.
  const newMail = tasks.filter(
    t => t.source === "mail" && (t.status === "open" || t.status === "in_progress") && !state.seenMailTaskIds.includes(t.id)
  );
  if (newMail.length > 0) {
    await sendPushToAll({
      title: newMail.length === 1 ? "📬 Nieuwe taak uit mail" : `📬 ${newMail.length} nieuwe taken uit mail`,
      body: newMail.slice(0, 3).map(t => t.title).join(" · ").slice(0, 140),
      url: "/", tag: "mail-tasks",
    });
    state.seenMailTaskIds.push(...newMail.map(t => t.id));
    if (state.seenMailTaskIds.length > 500) state.seenMailTaskIds = state.seenMailTaskIds.slice(-300);
    changed = true;
  }

  // 3) Deadline-waarschuwing: 1× per dag na 08:00 Amsterdam.
  if (hour >= 8 && state.lastDeadlineDate !== today) {
    const tomorrow = new Date(new Date(`${today}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
    const active = tasks.filter(t => (t.status === "open" || t.status === "in_progress") && t.taskKind !== "routine");
    const overdue = active.filter(t => { const d = deadlineOf(t); return d && d < today; });
    const todayDue = active.filter(t => deadlineOf(t) === today);
    const tomorrowDue = active.filter(t => deadlineOf(t) === tomorrow);
    if (overdue.length + todayDue.length + tomorrowDue.length > 0) {
      const parts: string[] = [];
      if (overdue.length) parts.push(`${overdue.length} te laat`);
      if (todayDue.length) parts.push(`${todayDue.length} vandaag`);
      if (tomorrowDue.length) parts.push(`${tomorrowDue.length} morgen`);
      const first = [...overdue, ...todayDue, ...tomorrowDue][0];
      await sendPushToAll({
        title: "📅 Deadlines",
        body: `${parts.join(" · ")}${first ? ` — bv. ${first.title}` : ""}`.slice(0, 140),
        url: "/", tag: "deadlines",
      });
    }
    state.lastDeadlineDate = today;
    changed = true;
  }

  if (changed) await writeState(state);
}
