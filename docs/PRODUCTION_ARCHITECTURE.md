# Production Architecture — AI Mentor

## Overzicht

```
┌─────────────────────────────────────────────────────────────────┐
│                       Cloudflare                                 │
│              mentor.reishacker.nl                                │
│     DDoS-bescherming · WAF · TLS-terminatie                      │
│         Cloudflare Access (single-user auth)                     │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  VPS — Hetzner CX22                              │
│                Ubuntu 24.04 · Docker · Coolify                   │
│                                                                  │
│  ┌────────────────┐   ┌────────────────┐   ┌─────────────────┐  │
│  │  mentor-web    │   │  mentor-worker │   │   PostgreSQL 16  │  │
│  │  Next.js 16    │   │  node-cron     │   │   port 5432      │  │
│  │  port 3000     │   │                │   └─────────────────┘  │
│  │                │   │ • outbox/5m    │                         │
│  │  API routes    │   │ • repair/15m   │   ┌─────────────────┐  │
│  │  Calendar sync │   │ • watch/6h     │   │  ntfy (opt.)    │  │
│  │  Task mgmt     │   │ • briefing/7:30│   │  port 8080      │  │
│  │  AI chat       │   │                │   └─────────────────┘  │
│  └────────────────┘   └────────────────┘                         │
│        │                     │                                   │
│        └──────┬──────────────┘                                   │
│               │ shared volume: /app/data                         │
└───────────────┼─────────────────────────────────────────────────┘
                │
         ┌──────┴──────────────────────┐
         │                             │
         ▼                             ▼
  Google Calendar API          OpenAI / DeepSeek
  (OAuth2 · Webhooks)          (AI mentor engine)
```

---

## Componenten

### mentor-web (Next.js 16)
- **Rol:** Webapplicatie + API-server
- **Port:** 3000 (intern), publiek via Traefik op 443
- **Verantwoordelijkheden:**
  - Dashboard UI (taken, planner, kalender, AI-chat)
  - REST API endpoints voor alle features
  - Google Calendar sync (webhook ontvangen, full/incremental sync)
  - OAuth2 flow (Google)
  - Task management (CRUD, recurring, scheduling)
  - Conflict detectie + resolutie

### mentor-worker (node-cron)
- **Rol:** Achtergrond scheduler
- **Geen publiek port** (intern proces)
- **Jobs:**

| Job | Frequentie | Doel |
|-----|-----------|------|
| outbox-process | Elke 5 min | Verwerk wachtende calendar writes |
| repair-sync | Elke 15 min | Incremental Google Calendar sync |
| watch-ensure | Elke 6 uur | Webhook kanaal vernieuwen voor expiry |
| daily-briefing | 07:30 AMS | AI-briefing genereren + verzenden |

### PostgreSQL 16
- **Rol:** Primaire database (productie)
- **Beheer via:** Coolify Managed Database
- **Backup:** Coolify Scheduled Backups → S3/B2
- **Tabellen:** tasks, google_tokens, google_calendar_sync_state, google_calendar_channels, google_calendar_event_cache, calendar_outbox, calendar_conflicts, calendar_sync_log, daily_briefings

### JSON fallback (local-dev)
- Alle storage-modules vallen terug op JSON-bestanden in `data/` als `DATABASE_URL` niet ingesteld is
- Geschikt voor lokale ontwikkeling zonder database
- **Niet geschikt voor productie** (geen ACID, last-write-wins bij concurrent writes)

---

## Datastroom: Google Calendar near-live sync

```
Google Calendar Event wijziging
         │
         ▼
Google stuurt webhook POST → mentor.reishacker.nl/api/google/calendar/webhook
         │
         ▼
incrementalSyncCalendar(calendarId)
         │
         ├─► Haal gewijzigde events op via googleapis
         ├─► Schrijf naar EventCache (DB of JSON)
         └─► syncCacheToTasks()
                  │
                  ├─► Match events met taken (via calendarLink.eventId)
                  ├─► Detecteer conflicten → sla op in CalendarConflicts
                  └─► Update task.syncStatus
```

## Datastroom: calendar writes (Outbox)

```
User: plan taak in kalender
         │
         ▼
POST /api/calendar/sync-task { mode: "outbox" }
         │
         ▼
enqueueCalendarJob() → CalendarOutbox (status: pending)
         │
         ▼ (5 min later)
mentor-worker: processPendingCalendarJobs()
         │
         ├─► Google Calendar API: createEvent / updateEvent / deleteEvent
         ├─► Bij succes: update task.calendarLink (status: synced)
         └─► Bij fout: retry met exponential backoff (max 5x)
```

---

## Toekomstige modules

| Module | Status | Opslag | Beschrijving |
|--------|--------|--------|--------------|
| Google Analytics | Roadmap Q3 2026 | DB: analytics_snapshots | Traffic, top pages, revenue events |
| Affiliate tracking | Roadmap Q3 2026 | DB: affiliate_records | CSV import, maandelijkse omzet |
| Finance | Roadmap Q4 2026 | DB: transactions | Bank CSV import, P&L, later PSD2 |
| PSD2 (GoCardless) | Roadmap 2027 | DB: bank_connections | Automatische banksync |
| MCP filesystem | Roadmap Q1 2027 | n.v.t. | Read-only import map |

Zie [INTEGRATIONS_ROADMAP.md](INTEGRATIONS_ROADMAP.md) voor details.

---

## Deployment pipeline

```
Developer: git push → main
         │
         ▼
GitHub webhook → Coolify
         │
         ├─► Docker build (multi-stage)
         ├─► npx prisma generate
         ├─► npm run build (Next.js)
         └─► Deploy (rolling update, zero downtime)
                  │
                  └─► Coolify health check op /api/system/health
                            │
                            ├─► OK: switch traffic naar nieuwe container
                            └─► Fout: rollback naar vorige versie
```

---

## Monitoring

| Signal | Bron | Actie |
|--------|------|-------|
| Health check | `GET /api/system/health` | Coolify health probe elke 30s |
| Sync errors | `GET /api/google/calendar/outbox/status` | Worker logs + ntfy notificatie |
| Failed jobs | CalendarOutbox.status = "failed" | Handmatig via `/api/google/calendar/outbox/status` |
| Conflicts | CalendarConflicts.status = "open" | Zichtbaar in PlannerCalendar UI |
| Token expiry | health route warnings | ntfy notificatie bij dreigende expiry |

---

## Schaling (toekomst)

De huidige setup is bedoeld voor **single-user, single-server** gebruik. Voor schaling:

1. **Horizontaal (meerdere web containers):** Verander JSON-fallback volledig naar PostgreSQL (geen shared filesystem meer nodig), voeg Redis toe voor distributed caching
2. **Database read replicas:** Coolify ondersteunt PostgreSQL replicas
3. **CDN voor statische assets:** Cloudflare cacht automatisch Next.js static files
4. **Edge functies:** Overwegen voor lage-latency API responses (Cloudflare Workers)

Voor single-user persoonlijk gebruik is de huidige architectuur geschikt voor jaren.
