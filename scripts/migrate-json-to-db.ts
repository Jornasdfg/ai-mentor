// scripts/migrate-json-to-db.ts
// Migreert bestaande JSON-bestanden naar PostgreSQL via Prisma.
// Gebruik: npm run migrate:json-to-db
// Vereisten: DATABASE_URL ingesteld + npx prisma migrate deploy uitgevoerd

import * as fs from "fs/promises";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL niet ingesteld. Voeg toe aan .env.local.");
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();

  try {
    // ── Tasks ──────────────────────────────────────────────────────────────────
    const tasks = await readJson<unknown[]>("task_register.json");
    if (tasks?.length) {
      let count = 0;
      for (const task of tasks) {
        const t = task as Record<string, unknown>;
        await db.task.upsert({
          where: { id: t.id as string },
          create: {
            id: t.id as string,
            title: (t.title as string) ?? "",
            project: (t.project as string) ?? null,
            status: (t.status as string) ?? "open",
            priority: (t.priority as string) ?? "P2",
            hardDeadline: (t.hardDeadline as string) ?? null,
            softDeadline: (t.softDeadline as string) ?? null,
            startBy: (t.startBy as string) ?? null,
            leadTimeDays: (t.leadTimeDays as number) ?? null,
            estimatedMinutes: (t.estimatedMinutes as number) ?? null,
            nextAction: (t.nextAction as string) ?? null,
            tags: JSON.stringify(t.tags ?? []),
            source: (t.source as string) ?? "manual_input",
            plannedDate: (t.plannedDate as string) ?? null,
            plannedStart: (t.plannedStart as string) ?? null,
            plannedEnd: (t.plannedEnd as string) ?? null,
            plannedMinutes: (t.plannedMinutes as number) ?? null,
            calendarSyncMode: (t.calendarSyncMode as string) ?? null,
            calendarLink: t.calendarLink ? JSON.stringify(t.calendarLink) : null,
            createdAt: (t.createdAt as string) ?? new Date().toISOString(),
            updatedAt: (t.updatedAt as string) ?? null,
          },
          update: {
            title: (t.title as string) ?? "",
            status: (t.status as string) ?? "open",
            updatedAt: (t.updatedAt as string) ?? null,
          },
        });
        count++;
      }
      console.log(`✓ Tasks: ${count} gemigreerd`);
    }

    // ── Google tokens ──────────────────────────────────────────────────────────
    const tokenRaw = await readJson<Record<string, unknown>>("google_tokens.json");
    if (tokenRaw) {
      await db.googleToken.upsert({
        where: { id: "singleton" },
        create: {
          id: "singleton",
          provider: "google",
          connected: (tokenRaw.connected as boolean) ?? false,
          calendarId: (tokenRaw.calendarId as string) ?? "primary",
          scope: (tokenRaw.scope as string) ?? "",
          accessToken: (tokenRaw.accessToken as string) ?? null,
          refreshToken: (tokenRaw.refreshToken as string) ?? null,
          encryptedCredentials: tokenRaw.encryptedCredentials
            ? JSON.stringify(tokenRaw.encryptedCredentials)
            : null,
          expiryDate: BigInt((tokenRaw.expiryDate as number) ?? 0),
          createdAt: (tokenRaw.createdAt as string) ?? new Date().toISOString(),
          updatedAt: (tokenRaw.updatedAt as string) ?? new Date().toISOString(),
        },
        update: {
          connected: (tokenRaw.connected as boolean) ?? false,
          updatedAt: new Date().toISOString(),
        },
      });
      console.log("✓ Google tokens: gemigreerd");
    }

    // ── Calendar conflicts ─────────────────────────────────────────────────────
    type ConflictFile = { conflicts: Record<string, unknown>[] };
    const conflictsRaw = await readJson<ConflictFile>("calendar_conflicts.json");
    if (conflictsRaw?.conflicts?.length) {
      let count = 0;
      for (const c of conflictsRaw.conflicts) {
        await db.calendarConflict.upsert({
          where: { id: c.id as string },
          create: {
            id: c.id as string,
            taskId: c.taskId as string,
            eventId: c.eventId as string,
            calendarId: c.calendarId as string,
            status: (c.status as string) ?? "open",
            detectedAt: c.detectedAt as string,
            resolvedAt: (c.resolvedAt as string) ?? null,
            resolution: (c.resolution as string) ?? null,
            resolutionNote: (c.resolutionNote as string) ?? null,
            taskSnapshot: JSON.stringify(c.taskSnapshot ?? {}),
            googleEventSnapshot: JSON.stringify(c.googleEventSnapshot ?? {}),
          },
          update: { status: c.status as string },
        });
        count++;
      }
      console.log(`✓ Calendar conflicts: ${count} gemigreerd`);
    }

    // ── Outbox ─────────────────────────────────────────────────────────────────
    type OutboxFile = { jobs: Record<string, unknown>[] };
    const outboxRaw = await readJson<OutboxFile>("calendar_outbox.json");
    const pendingJobs = outboxRaw?.jobs?.filter(j => j.status === "pending" || j.status === "processing");
    if (pendingJobs?.length) {
      let count = 0;
      for (const j of pendingJobs) {
        await db.calendarOutbox.upsert({
          where: { id: j.id as string },
          create: {
            id: j.id as string,
            type: j.type as string,
            taskId: j.taskId as string,
            calendarId: j.calendarId as string,
            eventId: (j.eventId as string) ?? null,
            payload: JSON.stringify(j.payload ?? {}),
            status: "pending",
            attempts: (j.attempts as number) ?? 0,
            lastError: (j.lastError as string) ?? null,
            createdAt: j.createdAt as string,
            updatedAt: j.updatedAt as string,
            nextAttemptAt: j.nextAttemptAt as string,
          },
          update: { status: "pending" },
        });
        count++;
      }
      console.log(`✓ Outbox jobs (pending): ${count} gemigreerd`);
    }

    console.log("\n✅ Migratie voltooid.");
  } finally {
    await db.$disconnect();
  }
}

main().catch(err => {
  console.error("Migratie mislukt:", err);
  process.exit(1);
});
