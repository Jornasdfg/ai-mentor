# Storage Migration Plan — AI Mentor

## Huidige situatie

Alle data leeft als flat-file JSON in `data/`. Elke write overschrijft het volledige bestand. Bij gelijktijdige requests kan data verloren gaan (last-write-wins).

Bestanden die later naar een database moeten:

| Bestand | Tabel | Prioriteit |
|---------|-------|------------|
| `data/task_register.json` | `tasks` | Hoog — kern-databron |
| `data/google_tokens.json` | `google_tokens` | Hoog — veiligheid |
| `data/google_calendar_sync_state.json` | `google_calendar_sync_state` | Hoog — sync integriteit |
| `data/google_calendar_channels.json` | `google_calendar_channels` | Hoog — webhook veiligheid |
| `data/google_calendar_event_cache.json` | `google_calendar_event_cache` | Middel — kan herbouwd worden via full sync |
| `data/calendar_outbox.json` | `calendar_outbox` | Hoog — job delivery garantie |
| `data/google_calendar_sync_log.json` | `calendar_sync_log` | Laag — observability only |
| `data/calendar_conflicts.json` | `calendar_conflicts` | Middel — user action vereist |

---

## Optie 1 — SQLite + Prisma (single-user, local/hosted VPS)

**Geschikt voor:** single-user installatie, VPS, Raspberry Pi, eigen server.

**Voordelen:**
- Geen externe database nodig
- ACID-transacties voorkomen data-verlies bij gelijktijdige writes
- Prisma migraties zijn reproduceerbaar
- Bestand blijft lokaal (privacy-vriendelijk)

**Nadelen:**
- Niet geschikt voor horizontale scaling
- SQLite heeft beperkingen bij zware gelijktijdige writes (WAL mode helpt)

**Setup:**
```bash
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite
```

---

## Optie 2 — PostgreSQL + Prisma (hosted production)

**Geschikt voor:** Vercel, Railway, Render, cloud-hosted deployment.

**Voordelen:**
- Volledige ACID-compliance
- Horizontaal schaalbaar
- Goede support in Vercel/Neon/Supabase
- Prisma ORM maakt migratie van SQLite naar Postgres eenvoudig

**Nadelen:**
- Externe service nodig (kosten, latency)
- Meer configuratie

**Aanbeveling:** gebruik [Neon](https://neon.tech) (serverless Postgres, gratis tier) voor gehoste productie.

---

## Schema voorstel (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite" // of "postgresql"
  url      = env("DATABASE_URL")
}

model Task {
  id                String   @id
  title             String
  project           String?
  status            String   @default("open")
  priority          String   @default("P2")
  hardDeadline      String?
  softDeadline      String?
  startBy           String?
  leadTimeDays      Int?
  estimatedMinutes  Int?
  nextAction        String?
  tags              String   @default("[]") // JSON array
  source            String   @default("manual_input")
  plannedDate       String?
  plannedStart      String?
  plannedEnd        String?
  plannedMinutes    Int?
  calendarSyncMode  String?
  calendarLink      String?  // JSON blob (CalendarLink)
  updatedAt         String?
  createdAt         String   @default("")

  @@map("tasks")
}

model GoogleToken {
  id                   String  @id @default("singleton")
  provider             String  @default("google")
  connected            Boolean @default(false)
  calendarId           String  @default("primary")
  scope                String  @default("")
  accessToken          String? // Encrypted if GOOGLE_TOKEN_ENCRYPTION_KEY set
  refreshToken         String? // Encrypted if GOOGLE_TOKEN_ENCRYPTION_KEY set
  encryptedCredentials String? // JSON blob (iv, authTag, data)
  expiryDate           BigInt  @default(0)
  createdAt            String
  updatedAt            String

  @@map("google_tokens")
}

model GoogleCalendarSyncState {
  calendarId             String  @id
  nextSyncToken          String?
  lastFullSyncAt         String?
  lastIncrementalSyncAt  String?
  lastError              String?
  updatedAt              String?

  @@map("google_calendar_sync_state")
}

model GoogleCalendarChannel {
  id          String  @id
  calendarId  String
  resourceId  String
  resourceUri String  @default("")
  tokenHash   String
  expiration  BigInt
  webhookUrl  String
  active      Boolean @default(true)
  createdAt   String
  updatedAt   String

  @@map("google_calendar_channels")
}

model GoogleCalendarEventCache {
  calendarId         String
  eventId            String
  iCalUID            String  @default("")
  etag               String  @default("")
  status             String  @default("confirmed")
  summary            String  @default("")
  description        String?
  start              String  @default("")
  end                String  @default("")
  updated            String  @default("")
  htmlLink           String?
  extendedProperties String? // JSON blob
  lastSeenAt         String

  @@id([calendarId, eventId])
  @@map("google_calendar_event_cache")
}

model CalendarOutbox {
  id            String  @id
  type          String  // create_event | update_event | delete_event
  taskId        String
  calendarId    String
  eventId       String?
  payload       String  // JSON blob
  status        String  @default("pending")
  attempts      Int     @default(0)
  lastError     String?
  createdAt     String
  updatedAt     String
  nextAttemptAt String

  @@map("calendar_outbox")
}

model CalendarSyncLog {
  id         String @id
  type       String
  calendarId String
  message    String
  createdAt  String

  @@map("calendar_sync_log")
}

model CalendarConflict {
  id                   String  @id
  taskId               String
  eventId              String
  calendarId           String
  status               String  @default("open")
  detectedAt           String
  resolvedAt           String?
  resolution           String?
  resolutionNote       String?
  taskSnapshot         String  // JSON blob
  googleEventSnapshot  String  // JSON blob

  @@map("calendar_conflicts")
}
```

---

## Migratiestrategie (stap voor stap)

### Stap 1 — Prisma installeren (niet brekend)
```bash
npm install prisma @prisma/client better-sqlite3
npx prisma init --datasource-provider sqlite
```
Kopieer schema hierboven naar `prisma/schema.prisma`.

### Stap 2 — Storage abstractielaag schrijven
Maak per entiteit een storage module die dezelfde interface exporteert als de huidige JSON-modules:
- `lib/storage/taskStorage.ts` (vervangt mentorStorage voor taken)
- `lib/storage/tokenStorage.ts` (vervangt googleTokenStorage)
- etc.

Schakel per module over zonder routes aan te raken.

### Stap 3 — Migratie script
```typescript
// scripts/migrate-json-to-db.ts
// Lees alle JSON bestanden, schrijf naar DB via Prisma
```

### Stap 4 — Verwijder JSON bestanden uit gitignore (ze zijn dan niet meer de databron)

### Stap 5 — PostgreSQL switch
Verander `DATABASE_URL` in `.env.local` naar een Postgres connection string. Prisma migraties zijn provider-agnostisch.

---

## Tijdlijn aanbeveling

| Fase | Wanneer |
|------|---------|
| Huidige JSON storage | Tot ~100 taken, single-user, lokaal |
| SQLite + Prisma | Zodra concurrent writes problemen geven of als je wil hosten |
| PostgreSQL | Zodra je wil deployen naar Vercel/Railway/Render |
