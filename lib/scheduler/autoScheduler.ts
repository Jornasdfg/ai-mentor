import { readTasks, writeTasks } from "@/lib/mentor/mentorStorage";
import {
  readScheduleBlocks,
  writeScheduleBlocks,
  readSchedulingWindows,
  readScheduleRuns,
  writeScheduleRuns,
  ensureDefaultSchedulingWindows,
} from "./scheduleStorage";
import { enqueueCalendarJob } from "@/lib/calendar/calendarOutbox";
import { readEventCache } from "@/lib/calendar/googleSyncStorage";
import type { MentorTask, ScheduleBlock, ScheduleRun, SchedulingWindow, ScheduleColorState } from "@/lib/mentorTypes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowISO(): string {
  return new Date().toISOString();
}

function todayInAMS(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function isoDateOf(dt: string): string {
  return dt.slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toLocalDT(dateISO: string, timeHHMM: string): string {
  return `${dateISO}T${timeHHMM}:00`;
}

function dtMs(dt: string): number {
  if (!dt) return 0;
  try { return new Date(dt).getTime(); } catch { return 0; }
}

function minutesBetween(a: string, b: string): number {
  return (dtMs(b) - dtMs(a)) / 60000;
}

function addMinutes(dt: string, minutes: number): string {
  const d = new Date(dt);
  d.setMinutes(d.getMinutes() + minutes);
  // Return as local-ish ISO without timezone suffix — keep same format
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${min}:00`;
}

function isoWeekday(dateISO: string): number {
  // 1=Mon..7=Sun
  const d = new Date(`${dateISO}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
}

function uniqueId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Slot types ────────────────────────────────────────────────────────────────

interface TimeSlot {
  start: string;
  end: string;
  windowId?: string;
}

// Huidige tijd in Amsterdam, afgerond naar boven op 15 min → "YYYY-MM-DDTHH:MM:00".
function nowLocalDT(): string {
  const s = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" }); // "2026-05-30 14:23:45"
  const [date, time] = s.split(" ");
  const [h, m] = time.split(":").map(Number);
  let total = Math.ceil((h * 60 + m) / 15) * 15;
  if (total >= 24 * 60) total = 24 * 60 - 1;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00`;
}

// ── Build window slots for horizon ────────────────────────────────────────────

function buildWindowSlots(windows: SchedulingWindow[], from: string, to: string, nowDT: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  let cursor = from;
  while (cursor <= to) {
    const wd = isoWeekday(cursor);
    for (const win of windows) {
      if (!win.isActive) continue;
      if (!win.daysOfWeek.includes(wd)) continue;
      let start = toLocalDT(cursor, win.startTime);
      const end = toLocalDT(cursor, win.endTime);
      // Plan nooit in het verleden: klem de starttijd naar "nu".
      if (start < nowDT) start = nowDT;
      if (start >= end) continue; // venster is al voorbij vandaag
      slots.push({ start, end, windowId: win.id });
    }
    cursor = addDays(cursor, 1);
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));
  return slots;
}

// ── Interval subtraction ──────────────────────────────────────────────────────

function subtractOne(slot: TimeSlot, busyStart: string, busyEnd: string): TimeSlot[] {
  const sMs = dtMs(slot.start);
  const eMs = dtMs(slot.end);
  const bsMs = dtMs(busyStart);
  const beMs = dtMs(busyEnd);
  if (beMs <= sMs || bsMs >= eMs) return [slot];
  if (bsMs <= sMs && beMs >= eMs) return [];
  const result: TimeSlot[] = [];
  if (bsMs > sMs) result.push({ start: slot.start, end: busyStart, windowId: slot.windowId });
  if (beMs < eMs) result.push({ start: busyEnd, end: slot.end, windowId: slot.windowId });
  return result;
}

function subtractBusy(slots: TimeSlot[], busy: TimeSlot[]): TimeSlot[] {
  let result = [...slots];
  for (const b of busy) {
    const next: TimeSlot[] = [];
    for (const s of result) next.push(...subtractOne(s, b.start, b.end));
    result = next;
  }
  return result.filter(s => minutesBetween(s.start, s.end) >= 15);
}

// ── Color state ───────────────────────────────────────────────────────────────

function colorState(task: MentorTask, blockStart: string, todayISO: string): ScheduleColorState {
  const deadline = task.hardDeadline ?? task.deadline;
  if (!deadline) return "gray";
  const daysLeft = Math.ceil(
    (dtMs(deadline + "T23:59:59") - dtMs(blockStart)) / 86400000
  );
  if (daysLeft < 0) return "red";
  if (daysLeft <= 2) return "orange";
  if (task.softDeadline && blockStart.slice(0, 10) > task.softDeadline) return "orange";
  return "green";
}

// ── Main recalculate function ─────────────────────────────────────────────────

export async function recalculateSchedule(options: {
  triggeredBy: ScheduleRun["triggeredBy"];
  horizonDays?: number;
  syncToGoogle?: boolean;
}): Promise<{
  run: ScheduleRun;
  tasks: MentorTask[];
  blocks: ScheduleBlock[];
  warnings: string[];
}> {
  const { triggeredBy, horizonDays = 28, syncToGoogle = false } = options;
  const warnings: string[] = [];
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = nowISO();
  const todayISO = todayInAMS();
  const horizonEnd = addDays(todayISO, horizonDays);

  await ensureDefaultSchedulingWindows();

  const [allTasks, existingBlocks, windows, cachedGoogleEvents] = await Promise.all([
    readTasks(),
    readScheduleBlocks(),
    readSchedulingWindows(),
    readEventCache().catch(() => []),
  ]);

  // ── 0. Vaste afspraken & handmatig vastgepinde taken (= bezet) ─────────────
  // Een "appointment" heeft een vast tijdstip en wordt nooit auto-ingepland;
  // flexibele taken worden eromheen gepland. Idem voor taken met autoSchedule "off"
  // of locked die de gebruiker handmatig op een tijd heeft gezet.
  const isFixed = (t: MentorTask) =>
    (t.status === "open" || t.status === "in_progress") && !!t.plannedStart && !!t.plannedEnd &&
    (t.taskKind === "appointment" || t.autoSchedule === "off" || t.locked === true);
  const fixedTasks = allTasks.filter(isFixed);
  const fixedIds = new Set(fixedTasks.map(t => t.id));

  // ── 1. Split existing blocks ──────────────────────────────────────────────
  const keptBlocks: ScheduleBlock[] = [];
  let removedCount = 0;

  for (const block of existingBlocks) {
    const blockDate = isoDateOf(block.start);
    if (blockDate < todayISO) { removedCount++; continue; } // ruim verleden blokken op
    const inHorizon = blockDate >= todayISO && blockDate <= horizonEnd;
    // Verwijder herplanbare auto-blocks én oude appointment-blocks (regenereren we vers).
    if (inHorizon && ((block.source === "auto_scheduler" && !block.locked) || fixedIds.has(block.taskId))) {
      removedCount++;
    } else {
      keptBlocks.push(block);
    }
  }

  // ── 2. Build busy intervals ───────────────────────────────────────────────
  // Locked blocks → busy
  const lockedBusy: TimeSlot[] = keptBlocks
    .filter(b => b.locked || b.source !== "auto_scheduler")
    .map(b => ({ start: b.start, end: b.end }));

  // Google events NOT created by this app → external busy blocks.
  // All-day events tellen NIET als bezet voor timed-planning (consistent met de chat-context);
  // anders blokkeert een all-day item een hele dag (en door exclusieve einddatum zelfs de volgende).
  const googleBusy: TimeSlot[] = cachedGoogleEvents
    .filter(e => {
      if (e.status === "cancelled") return false;
      if (!e.start || e.start.length <= 10) return false;       // all-day → overslaan
      if (e.extendedProperties?.private?.aiMentorTaskId) return false; // app-event zit al in blocks
      return true;
    })
    .map(e => ({ start: e.start, end: e.end && e.end.length > 10 ? e.end : e.start }))
    .filter(e => dtMs(e.end) > dtMs(`${todayISO}T00:00:00`) && dtMs(e.start) < dtMs(`${horizonEnd}T23:59:59`));

  // Vaste afspraken + handmatig vastgepinde taken → bezet, zodat flexibele taken eromheen plannen.
  const fixedBusy: TimeSlot[] = fixedTasks.map(t => ({ start: t.plannedStart!, end: t.plannedEnd! }));

  const allBusy = [...lockedBusy, ...googleBusy, ...fixedBusy];
  allBusy.sort((a, b) => a.start.localeCompare(b.start));

  // ── 3. Build available window slots ──────────────────────────────────────
  const activeWindows = windows.filter(w => w.isActive);
  const baseWindows = activeWindows.length > 0 ? activeWindows : [{
    id: "fallback", name: "Fallback", type: "work" as const,
    daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:30",
    isActive: true, createdAt: nowISO(), updatedAt: nowISO(),
  }];
  if (activeWindows.length === 0) warnings.push("Geen actieve scheduling windows — fallback Ma-Vr 09:00-17:30");

  const windowSlots = buildWindowSlots(baseWindows, todayISO, horizonEnd, nowLocalDT());
  const slotPool: TimeSlot[] = subtractBusy(windowSlots, allBusy);

  // ── 4. Select and sort schedulable tasks ──────────────────────────────────
  const pOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

  const schedulable = allTasks
    .filter(t => {
      if (t.status !== "open" && t.status !== "in_progress") return false;
      if (t.taskKind === "appointment") return false; // vaste afspraken nooit auto-inplannen
      if (t.autoSchedule === "off") return false;
      if (t.locked) return false;
      // Geen estimatedMinutes-eis meer: oningeplande taken (incl. mail/routine) krijgen
      // een standaardduur (zie remaining = estimatedMinutes ?? 30) en worden alsnog ingepland.
      return true;
    })
    .sort((a, b) => {
      const pd = (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
      if (pd !== 0) return pd;
      const da = a.hardDeadline ?? a.deadline ?? "9999";
      const db = b.hardDeadline ?? b.deadline ?? "9999";
      if (da !== db) return da.localeCompare(db);
      const ma = a.manualSortOrder ?? 999999;
      const mb = b.manualSortOrder ?? 999999;
      if (ma !== mb) return ma - mb;
      return a.createdAt.localeCompare(b.createdAt);
    });

  // ── 5. Schedule tasks ─────────────────────────────────────────────────────
  const newBlocks: ScheduleBlock[] = [];
  const updatedTasks = allTasks.map(t => ({ ...t }));
  let slotIdx = 0;

  for (const task of schedulable) {
    const minBlock = task.minBlockMinutes ?? 30;
    const splittable = task.splittable !== false; // default true
    const startBy = task.startBy ?? null;
    const deadline = task.hardDeadline ?? task.deadline;

    // Subtract time already covered by locked blocks for this task
    const lockedMinutes = keptBlocks
      .filter(b => b.taskId === task.id && b.locked)
      .reduce((sum, b) => sum + b.durationMinutes, 0);
    const baseEstimate = task.estimatedMinutes && task.estimatedMinutes > 0 ? task.estimatedMinutes : 30;
    let remaining = Math.max(0, baseEstimate - lockedMinutes);
    if (remaining <= 0) continue;

    const taskBlocks: ScheduleBlock[] = [];
    let placed = false;
    let tempSlotIdx = slotIdx;

    while (remaining > 0 && tempSlotIdx < slotPool.length) {
      const slot = slotPool[tempSlotIdx];
      if (!slot) { tempSlotIdx++; continue; }

      // Respect startBy
      if (startBy && isoDateOf(slot.start) < startBy) { tempSlotIdx++; continue; }

      const slotMins = minutesBetween(slot.start, slot.end);
      if (slotMins < 15) { tempSlotIdx++; continue; }

      if (!splittable) {
        // Need full remaining in one slot
        if (slotMins < remaining) { tempSlotIdx++; continue; }
        const blockEnd = addMinutes(slot.start, remaining);
        const color = colorState(task, slot.start, todayISO);
        const block: ScheduleBlock = {
          id: uniqueId(),
          taskId: task.id,
          title: task.title,
          start: slot.start,
          end: blockEnd,
          durationMinutes: remaining,
          status: deadline && blockEnd.slice(0, 10) > deadline ? "missed" : "planned",
          colorState: color,
          source: "auto_scheduler",
          locked: false,
          schedulingWindowId: slot.windowId ?? null,
          calendarEventId: null,
          calendarId: null,
          calendarSynced: false,
          runId,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        taskBlocks.push(block);
        newBlocks.push(block);
        slotPool[tempSlotIdx] = { ...slot, start: blockEnd };
        remaining = 0;
        placed = true;
        break;
      } else {
        // Splittable: take as much as fits, min minBlock
        const useMin = Math.min(slotMins, remaining);
        if (useMin < minBlock && remaining > minBlock) { tempSlotIdx++; continue; }
        const actualMin = Math.max(useMin, Math.min(minBlock, remaining));
        const blockEnd = addMinutes(slot.start, actualMin);
        const color = colorState(task, slot.start, todayISO);
        const block: ScheduleBlock = {
          id: uniqueId(),
          taskId: task.id,
          title: task.title,
          start: slot.start,
          end: blockEnd,
          durationMinutes: actualMin,
          status: deadline && blockEnd.slice(0, 10) > deadline ? "missed" : "planned",
          colorState: color,
          source: "auto_scheduler",
          locked: false,
          schedulingWindowId: slot.windowId ?? null,
          calendarEventId: null,
          calendarId: null,
          calendarSynced: false,
          runId,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        taskBlocks.push(block);
        newBlocks.push(block);
        remaining -= actualMin;
        slotPool[tempSlotIdx] = { ...slot, start: blockEnd };
        if (minutesBetween(slotPool[tempSlotIdx].start, slotPool[tempSlotIdx].end) < 15) {
          slotPool.splice(tempSlotIdx, 1);
        } else {
          tempSlotIdx++;
        }
        placed = true;
      }
    }

    // Update task state
    const ti = updatedTasks.findIndex(t => t.id === task.id);
    if (ti === -1) continue;

    if (taskBlocks.length === 0 && !placed) {
      if (task.autoIgnore) {
        updatedTasks[ti].unscheduledReason = "autoIgnore: niet ingepland";
        updatedTasks[ti].scheduleStatus = "unscheduled";
        updatedTasks[ti].scheduleColorState = "gray";
      } else {
        warnings.push(`"${task.title}": geen vrije slots gevonden`);
        updatedTasks[ti].unscheduledReason = "Geen vrije slots beschikbaar";
        updatedTasks[ti].scheduleStatus = "unscheduled";
        updatedTasks[ti].scheduleColorState = "gray";
      }
    } else {
      const lastBlock = taskBlocks[taskBlocks.length - 1];
      const finalColor = lastBlock ? colorState(task, lastBlock.start, todayISO) : "gray";
      const finalStatus = lastBlock && deadline && lastBlock.end.slice(0, 10) > deadline ? "missed" : "planned";
      updatedTasks[ti].scheduleColorState = finalColor;
      updatedTasks[ti].scheduleStatus = finalStatus;
      updatedTasks[ti].unscheduledReason = null;
      // Backward compat: set plannedStart/plannedEnd only if single block
      if (taskBlocks.length === 1) {
        updatedTasks[ti].plannedStart = taskBlocks[0].start;
        updatedTasks[ti].plannedEnd = taskBlocks[0].end;
        updatedTasks[ti].plannedDate = isoDateOf(taskBlocks[0].start);
        updatedTasks[ti].plannedMinutes = taskBlocks[0].durationMinutes;
      }
    }
  }

  // ── 5b. Vaste afspraken (+ handmatig vastgepinde taken) als locked blocks ──
  const appointmentBlocks: ScheduleBlock[] = fixedTasks
    .filter(t => {
      const d = isoDateOf(t.plannedStart!);
      return d >= todayISO && d <= horizonEnd;
    })
    .map(t => ({
      id: uniqueId(),
      taskId: t.id,
      title: t.title,
      start: t.plannedStart!,
      end: t.plannedEnd!,
      durationMinutes: t.plannedMinutes ?? Math.max(15, Math.round(minutesBetween(t.plannedStart!, t.plannedEnd!))),
      status: "locked" as const,
      colorState: "gray" as const,
      source: "manual_plan" as const,
      locked: true,
      schedulingWindowId: null,
      calendarEventId: t.calendarLink?.eventId ?? null,
      calendarId: t.calendarLink?.calendarId ?? null,
      calendarSynced: t.calendarLink?.syncStatus === "synced",
      runId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }));

  // ── 6. Write blocks ───────────────────────────────────────────────────────
  const finalBlocks = [...keptBlocks, ...newBlocks, ...appointmentBlocks];
  await writeScheduleBlocks(finalBlocks);
  await writeTasks(updatedTasks);

  // ── 7. Queue Google sync ──────────────────────────────────────────────────
  // - Flexibele auto-blokken: alleen bij calendarSyncMode "auto" (opt-in).
  // - Vaste afspraken/gepinde taken: standaard pushen (tenzij calendarSyncMode "none").
  if (syncToGoogle) {
    const toSync: Array<{ block: ScheduleBlock; appointment: boolean }> = [
      ...newBlocks.map(block => ({ block, appointment: false })),
      ...appointmentBlocks.map(block => ({ block, appointment: true })),
    ];
    for (const { block, appointment } of toSync) {
      const task = updatedTasks.find(t => t.id === block.taskId);
      if (!task) continue;
      const shouldSync = appointment ? task.calendarSyncMode !== "none" : task.calendarSyncMode === "auto";
      if (!shouldSync) continue;
      await enqueueCalendarJob(
        task.calendarLink?.eventId ? "update_event" : "create_event",
        task.id,
        task.calendarLink?.calendarId ?? "primary",
        {
          title: task.title,
          description: [
            task.project ? `Project: ${task.project}` : null,
            `Prioriteit: ${task.priority}`,
            task.nextAction ? `Volgende actie: ${task.nextAction}` : null,
          ].filter(Boolean).join("\n"),
          start: block.start,
          end: block.end,
          timeZone: "Europe/Amsterdam",
          calendarId: task.calendarLink?.calendarId ?? "primary",
          taskId: task.id,
        },
        task.calendarLink?.eventId ?? undefined
      ).catch(err => {
        warnings.push(`Google sync fout voor "${task.title}": ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  // ── 8. Save run record ────────────────────────────────────────────────────
  const run: ScheduleRun = {
    id: runId,
    triggeredBy,
    startedAt,
    finishedAt: nowISO(),
    horizonDays,
    blocksCreated: newBlocks.length,
    blocksRemoved: removedCount,
    warnings,
    status: "done",
  };
  const runs = await readScheduleRuns();
  runs.unshift(run);
  if (runs.length > 100) runs.splice(100);
  await writeScheduleRuns(runs);

  return { run, tasks: updatedTasks, blocks: finalBlocks, warnings };
}